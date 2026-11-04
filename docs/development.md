# Development and Releases

## Run Locally

Clone this repository and open its root in Android Studio. The project
uses JDK 17 and Android SDK Platform 35 with Build-Tools 35.0.0. Select an
emulator or USB-connected device and run the `app` configuration. The minimum
device version is Android 8.0.

For a debug APK, run `./gradlew assembleDebug` from the repository root
(`gradlew.bat assembleDebug` on Windows). The output is
`app/build/outputs/apk/debug/app-debug.apk`.

The self-contained HTML at
`app/src/main/assets/payload-defense-tracker.html` also opens in a browser
for guest browsing and comparison. Update the SHA-256 hash in the Content
Security Policy after changing its inline script.

## Enable LinkedIn Sign-In

1. Create a LinkedIn developer app and enable **Sign In with LinkedIn
   using OpenID Connect**.
2. In your Supabase project, enable the **LinkedIn (OIDC)** Auth provider.
   Copy its callback URL from the dashboard to the LinkedIn app’s authorized
   redirect URLs. Put the LinkedIn client ID and client secret in the
   Supabase provider settings.
3. Add `com.thetechnoscribe.thepayload://oauth/linkedin/*` to the Supabase Auth
   redirect allowlist. The final path segment is a random value for each
   sign-in attempt.
4. Add the two public settings below to your user-level
   `~/.gradle/gradle.properties` and rebuild.

   ```properties
   PAYLOAD_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   PAYLOAD_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

The app uses authorization code exchange with PKCE. It opens the system
browser for authentication, checks the callback against the current attempt,
and keeps the resulting access token in native memory. Closing the app
process or reaching the token expiry ends the session. Sign-in is optional,
and locally saved entries stay local.

- [LinkedIn OIDC provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-linkedin)
- [Supabase redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls)

## Deliver Updates Automatically

1. Create the app in Google Play Console with package ID
   `com.thetechnoscribe.thepayload`, set up Play App Signing, and publish the
   first signed Android App Bundle to **Internal testing**.
2. Configure a GitHub Actions workflow triggered by pushes to `main` to
   build and sign a release bundle with a higher `versionCode`. Keep the
   upload key and Play publishing credentials in GitHub secrets.
3. Give the workflow’s publishing identity access to the app and have the
   workflow upload successful builds to the internal track using the
   Google Play Developer API. Use an approval gate for the production track.
4. Testers install the app from Google Play’s testing link. Google Play then
   delivers updates according to each device’s update settings. A debug build
   installed from Android Studio can have a different signing key, so it may
   need to be replaced before joining the Play track. Save any device-only
   entries you want to keep before uninstalling a debug build.

- [Upload an Android App Bundle](https://developer.android.com/studio/publish/upload-bundle)
- [How Google Play app updates work](https://developer.android.com/google/play/app-updates)
- [Google Play Developer API](https://developers.google.com/android-publisher)
