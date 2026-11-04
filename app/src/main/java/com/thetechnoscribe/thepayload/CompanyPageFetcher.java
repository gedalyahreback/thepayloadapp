package com.thetechnoscribe.thepayload;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.Proxy;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

final class CompanyPageFetcher {
    private static final int MAX_BYTES = 512 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .dns(CompanyPageFetcher::publicAddresses)
            .proxy(Proxy.NO_PROXY)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(4, TimeUnit.SECONDS)
            .callTimeout(8, TimeUnit.SECONDS)
            .build();

    private CompanyPageFetcher() {}

    static byte[] fetch(String source) throws IOException {
        if (source == null || source.length() > 2048) {
            throw new IOException("Invalid URL");
        }

        HttpUrl url = HttpUrl.parse(source);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            verifyUrl(url);
            Call call = CLIENT.newCall(new Request.Builder().url(url)
                    .header("Accept", "text/html, application/xhtml+xml")
                    .header("User-Agent", "ThePayload/1.0 (company metadata preview)")
                    .build());
            call.timeout().deadlineNanoTime(deadline);
            try (Response response = call.execute()) {
                int status = response.code();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String destination = response.header("Location");
                    url = destination == null ? null : url.resolve(destination);
                    continue;
                }

                String type = response.header("Content-Type", "").toLowerCase(Locale.ROOT);
                ResponseBody body = response.body();
                if (status != 200 || body == null
                        || !(type.startsWith("text/html") || type.startsWith("application/xhtml+xml"))) {
                    throw new IOException("No HTML page available");
                }

                try (InputStream input = body.byteStream();
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    while (output.size() < MAX_BYTES) {
                        int read = input.read(buffer, 0, Math.min(buffer.length, MAX_BYTES - output.size()));
                        if (read < 0) {
                            break;
                        }
                        output.write(buffer, 0, read);
                    }
                    return output.toByteArray();
                }
            }
        }
        throw new IOException("Too many redirects");
    }

    private static void verifyUrl(HttpUrl url) throws IOException {
        if (url == null || !url.isHttps() || url.port() != 443
                || !url.encodedUsername().isEmpty() || !url.encodedPassword().isEmpty()) {
            throw new IOException("Public HTTPS company website required");
        }

        String host = url.host().replaceFirst("\\.$", "");
        if (!host.contains(".") || host.contains(":") || host.matches("[0-9.]+")
                || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")
                || host.equals("linkedin.com") || host.endsWith(".linkedin.com")
                || host.equals("lnkd.in") || host.endsWith(".lnkd.in")) {
            throw new IOException("Public company domain required");
        }
    }

    private static List<InetAddress> publicAddresses(String host) throws UnknownHostException {
        // Return these exact addresses to the HTTP client so it does not resolve the host again.
        List<InetAddress> addresses = Arrays.asList(InetAddress.getAllByName(host));
        for (InetAddress address : addresses) {
            byte[] bytes = address.getAddress();
            int first = bytes[0] & 255;
            int second = bytes[1] & 255;
            boolean reserved = address instanceof Inet4Address
                    ? first == 0 || first >= 224 || (first == 100 && second >= 64 && second <= 127)
                      || (first == 198 && (second == 18 || second == 19))
                    : (first & 0xe0) != 0x20;
            if (reserved || address.isAnyLocalAddress() || address.isLoopbackAddress()
                    || address.isLinkLocalAddress() || address.isSiteLocalAddress()
                    || address.isMulticastAddress()) {
                throw new UnknownHostException("Non-public network address");
            }
        }
        return addresses;
    }
}
