package com.thetechnoscribe.thepayload;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN;
    private static final String APP_PATH = "/assets/payload-defense-tracker.html";
    private static final String APP_URL = "https://" + APP_HOST + APP_PATH;
    private static final String IMPORT_PATH = "/company-import";
    private static final String SHARE_STATE = "pending-company-share";

    private FrameLayout root;
    private WebView tracker;
    private boolean trackerReady;
    private String pendingShare;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.background));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                        WindowInsets.Type.systemBars()
                                | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        tracker = new WebView(this);
        tracker.setBackgroundColor(getColor(R.color.background));
        root.addView(tracker, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = tracker.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(tracker, false);
        WebView.setWebContentsDebuggingEnabled(false);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        tracker.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isAppPath(url, IMPORT_PATH)) {
                    return importCompanyPage(request);
                }
                return assets.shouldInterceptRequest(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (isAppPath(Uri.parse(url), APP_PATH)) {
                    trackerReady = true;
                    deliverShare();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) {
                    return false;
                }

                Uri url = request.getUrl();
                String scheme = url.getScheme();
                if (isAppPath(url, APP_PATH)) {
                    return false;
                }

                if (request.hasGesture() && ("https".equals(scheme) || "http".equals(scheme))) {
                    openInBrowser(url);
                }
                return true;
            }
        });

        pendingShare = savedInstanceState == null
                ? readShare(getIntent()) : savedInstanceState.getString(SHARE_STATE);
        if (savedInstanceState == null || tracker.restoreState(savedInstanceState) == null) {
            tracker.loadUrl(APP_URL);
        }
    }

    private static boolean isAppPath(Uri url, String path) {
        return "https".equals(url.getScheme()) && APP_HOST.equals(url.getEncodedAuthority())
                && path.equals(url.getEncodedPath());
    }

    private static WebResourceResponse importCompanyPage(WebResourceRequest request) {
        boolean localFetch = !request.isForMainFrame() && "GET".equals(request.getMethod())
                && request.getRequestHeaders().entrySet().stream().anyMatch(header ->
                        "X-Payload-Import".equalsIgnoreCase(header.getKey()) && "1".equals(header.getValue()));
        if (localFetch) {
            try {
                byte[] page = CompanyPageFetcher.fetch(request.getUrl().getQueryParameter("url"));
                return new WebResourceResponse("text/plain", "UTF-8", 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(page));
            } catch (IOException | IllegalArgumentException ignored) {
                // The form can still suggest a name from the URL.
            }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 400, "Unavailable",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pendingShare = readShare(intent);
        deliverShare();
    }

    private static String readShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return null;
        }
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        ClipData clip = intent.getClipData();
        if ((text == null || text.length() == 0) && clip != null && clip.getItemCount() > 0) {
            ClipData.Item item = clip.getItemAt(0);
            text = item.getText();
            if (text == null && item.getUri() != null) {
                text = item.getUri().toString();
            }
        }
        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        String shared = ((subject == null ? "" : subject + "\n") + (text == null ? "" : text)).trim();
        return shared.substring(0, Math.min(shared.length(), 8000));
    }

    private void deliverShare() {
        if (trackerReady && pendingShare != null) {
            tracker.evaluateJavascript("window.openCompanyImport(" + JSONObject.quote(pendingShare) + ")", null);
            pendingShare = null;
        }
    }

    private void openInBrowser(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (tracker.canGoBack()) {
            tracker.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(SHARE_STATE, pendingShare);
        tracker.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        root.removeView(tracker);
        tracker.destroy();
        super.onDestroy();
    }
}
