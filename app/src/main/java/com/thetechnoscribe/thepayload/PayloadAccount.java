package com.thetechnoscribe.thepayload;

import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

final class PayloadAccount {
    static final String SCHEME = "com.thetechnoscribe.thepayload";
    private static final String PROVIDER = "linkedin_oidc";
    private static final long FLOW_LIFETIME = TimeUnit.MINUTES.toMillis(10);
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .followRedirects(false).followSslRedirects(false).callTimeout(12, TimeUnit.SECONDS).build();

    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final HttpUrl project = HttpUrl.parse(BuildConfig.PAYLOAD_SUPABASE_URL);
    private final String publishableKey = BuildConfig.PAYLOAD_SUPABASE_PUBLISHABLE_KEY;

    private String verifier;
    private String attempt;
    private long startedAt;
    private boolean exchanging;
    private String accessToken;
    private String displayName;
    private long expiresAt;
    private String message = "";

    boolean configured() {
        return project != null && project.isHttps() && project.port() == 443
                && project.host().matches("[a-z0-9-]+\\.supabase\\.co")
                && "/".equals(project.encodedPath()) && project.query() == null && project.fragment() == null
                && project.encodedUsername().isEmpty() && project.encodedPassword().isEmpty()
                && publishableKey.matches("sb_publishable_[A-Za-z0-9_-]+");
    }

    synchronized Uri begin() {
        if (!configured() || exchanging || accessToken != null) return null;
        verifier = randomToken();
        attempt = randomToken();
        startedAt = SystemClock.elapsedRealtime();
        message = "";
        String redirect = SCHEME + "://oauth/linkedin/" + attempt;
        HttpUrl url = project.newBuilder()
                .addPathSegments("auth/v1/authorize")
                .addQueryParameter("provider", PROVIDER)
                .addQueryParameter("redirect_to", redirect)
                .addQueryParameter("code_challenge", challenge(verifier))
                .addQueryParameter("code_challenge_method", "s256")
                .build();
        return Uri.parse(url.toString());
    }

    synchronized boolean receive(Uri uri, Runnable changed) {
        if (uri == null || !uri.isHierarchical() || !SCHEME.equals(uri.getScheme())
                || !"oauth".equals(uri.getEncodedAuthority()) || !configured()) return false;
        List<String> path = uri.getPathSegments();
        if (path.size() != 2 || !"linkedin".equals(path.get(0)) || !path.get(1).equals(attempt)
                || exchanging || SystemClock.elapsedRealtime() - startedAt > FLOW_LIFETIME) return false;

        String code = uri.getQueryParameter("code");
        String currentVerifier = verifier;
        attempt = null;
        verifier = null;
        if (code == null || !code.matches("[A-Za-z0-9._~-]{8,512}")) {
            message = "LinkedIn sign-in was canceled or expired. Try again.";
            return true;
        }
        runAuth(() -> {
            JSONObject body = new JSONObject().put("auth_code", code).put("code_verifier", currentVerifier);
            HttpUrl endpoint = authEndpoint("token").addQueryParameter("grant_type", "pkce").build();
            acceptSession(post(endpoint, body), "LinkedIn member");
        }, "Completing LinkedIn sign-in…", "LinkedIn sign-in could not be completed. Try again.", failure -> changed.run());
        return true;
    }

    synchronized boolean sendEmailCode(String email, AuthResult result) {
        if (!configured() || exchanging || accessToken != null) return false;
        attempt = null;
        verifier = null;
        runAuth(() -> post(authEndpoint("otp").build(),
                new JSONObject().put("email", email).put("create_user", true)),
                "Sending email code…", "Could not send a code. Check your email address and try again shortly.", result);
        return true;
    }

    synchronized boolean verifyEmailCode(String email, String code, AuthResult result) {
        if (!configured() || exchanging || accessToken != null) return false;
        runAuth(() -> {
            JSONObject body = new JSONObject().put("email", email).put("token", code).put("type", "email");
            acceptSession(post(authEndpoint("verify").build(), body), email);
        }, "Verifying email code…", "Could not verify the code. Check it or request a new one.", result);
        return true;
    }

    interface AuthResult {
        void complete(String failure);
    }

    private interface AuthRequest {
        void run() throws IOException, JSONException;
    }

    private void runAuth(AuthRequest request, String pending, String error, AuthResult result) {
        exchanging = true;
        message = pending;
        network.execute(() -> {
            String failure = "";
            try {
                request.run();
            } catch (IOException | JSONException ignored) {
                failure = error;
            } finally {
                synchronized (this) {
                    exchanging = false;
                    message = failure;
                }
                result.complete(failure);
            }
        });
    }

    private HttpUrl.Builder authEndpoint(String path) {
        return project.newBuilder().addPathSegments("auth/v1").addPathSegment(path);
    }

    private JSONObject post(HttpUrl endpoint, JSONObject body) throws IOException, JSONException {
        Request request = new Request.Builder().url(endpoint).header("apikey", publishableKey)
                .post(RequestBody.create(body.toString(), JSON)).build();
        try (Response response = CLIENT.newCall(request).execute()) {
            ResponseBody responseBody = response.body();
            if (!response.isSuccessful() || responseBody == null) throw new IOException("Auth request rejected");
            return new JSONObject(responseBody.string());
        }
    }

    private synchronized void acceptSession(JSONObject result, String fallback) throws IOException, JSONException {
        JSONObject metadata = result.getJSONObject("user").optJSONObject("user_metadata");
        String name = metadata == null ? "" : metadata.optString("full_name", metadata.optString("name", "")).trim();
        String token = result.getString("access_token");
        long lifetime = result.getLong("expires_in");
        if (token.isEmpty() || lifetime <= 0) throw new IOException("Invalid session");
        displayName = name.isEmpty() ? fallback : name.substring(0, Math.min(120, name.length()));
        accessToken = token;
        expiresAt = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(Math.min(lifetime, 86400));
    }

    synchronized void signOut() {
        String token = accessToken;
        accessToken = null;
        displayName = null;
        verifier = null;
        attempt = null;
        message = "";
        if (token == null) return;
        HttpUrl endpoint = project.newBuilder().addPathSegments("auth/v1/logout")
                .addQueryParameter("scope", "local").build();
        Request request = new Request.Builder().url(endpoint).header("apikey", publishableKey)
                .header("Authorization", "Bearer " + token).post(RequestBody.create("", JSON)).build();
        network.execute(() -> {
            try (Response ignored = CLIENT.newCall(request).execute()) {
                // The local session is already cleared even if the network is unavailable.
            } catch (IOException ignored) {}
        });
    }

    synchronized JSONObject state() throws JSONException {
        if (accessToken != null && SystemClock.elapsedRealtime() >= expiresAt) {
            accessToken = null;
            displayName = null;
            message = "Your session expired. Sign in again to continue.";
        }
        return new JSONObject().put("configured", configured()).put("busy", exchanging)
                .put("name", displayName == null ? "" : displayName).put("message", message);
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return encode(bytes);
    }

    private static String challenge(String verifier) {
        try {
            return encode(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static String encode(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
}
