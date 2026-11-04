# The Payload | Defense Company Tracker

A mobile-friendly directory of defense companies with search, filters, profiles,
a comparison view, and office maps. The Android app bundles the same
[self-contained tracker](app/src/main/assets/payload-defense-tracker.html) that
you can open directly in a desktop browser.

## Open and Run in Android Studio

1. Open Android Studio and choose **Clone Repository** (called **Get from VCS**
   in some versions). Paste
   `https://github.com/gedalyahreback/thepayloadapp.git` and click **Clone**.
   If you already downloaded the project, choose **Open** and select the
   folder containing `settings.gradle`.
2. Accept **Trust Project** if prompted and wait for Gradle sync. If the SDK
   is missing, open **Tools → SDK Manager** and install **Android SDK
   Platform 35**, **Android SDK Build-Tools 35.0.0**, and **Android SDK
   Platform-Tools**. Use JDK 17 or a compatible Android Studio bundled JDK as
   the Gradle JDK.
3. For a physical Android phone, enable **Developer options → USB debugging**,
   connect it with a data-capable USB cable, unlock it, and approve the USB
   debugging prompt. For an emulator, create a Pixel in **Tools → Device
   Manager** and start it.
4. Select the **app** run configuration and your device, then click **Run ▶**.
   The app supports Android 8.0 and newer.
5. Open D-Fend Solutions, tap **Compare**, and return to the profile to expand
   the map. The directory and comparison run offline. Google Maps, the remote
   logo, and external links use the internet. Companies you add are stored
   locally in this installation.

## Build a Debug APK

Run `./gradlew assembleDebug` from the project root on macOS or Linux, or
`gradlew.bat assembleDebug` on Windows. The result is
`app/build/outputs/apk/debug/app-debug.apk`.

The Gradle wrapper is distributed under the
[Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0).
