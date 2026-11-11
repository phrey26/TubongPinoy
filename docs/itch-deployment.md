# Publish the frontend on itch.io

The frontend upload is `dist/tubong-pinoy-itch.zip`. Supabase continues to host
the backend and account data. No PHP, database export, environment file, or
separate backend upload belongs on itch.io.

## Create the project page

1. Sign in to itch.io using the Big Chico Studio account and open
   [Create a new project](https://itch.io/game/new).
2. Set **Title** to **Tubong Pinoy**. Use **tubong-pinoy** as the project URL if
   available. Choose **HTML / HTML game** as the project kind and **No payments**
   for free access.
3. Under **Uploads**, upload `dist/tubong-pinoy-itch.zip` and mark it
   **This file will be played in the browser**. Upload the ZIP itself.
4. Under **Embed options**, enable **Scrollbars** (sometimes labelled **Enable
   scrollbars**) so the web app's longer pages can scroll. itch.io disables
   iframe scrolling by default. Use **Click to launch in fullscreen** for more
   room. If that mode hides the scrollbar setting, choose **Embed in page**,
   enable **Scrollbars** and **Fullscreen button**, and use the fullscreen button
   to expand the app. Save the settings and relaunch the game. Keep **Mobile
   friendly** off: Tumbang Preso currently requires mouse controls.
5. Add your cover image and description. A suitable short description is:

   > Filipino playground games, reimagined for your browser. Play Tumbang Preso
   > and Jolens Blast, customize your player, and build your collection.
   > Created by Big Chico Studio. A separate Tubong Pinoy account is required
   > to play and save progress.

   Studio links:
   - [Instagram](https://www.instagram.com/bigchicostudio11/)
   - [TikTok](https://www.tiktok.com/@bigchicostudio)
6. Leave visibility at **Draft**, save, and open **View page**. Launch the app
   and check signup/login, navigation, game start, audio after a click, profile
   saving, and store access. New Tumbang Preso runs require 20 Juice or an active
   unlimited pass. Reloading on itch.io must keep you signed in within the same
   tab. A fresh tab requires sign-in; Remember Me is disabled on the shared
   game host.
7. Once the draft works, change visibility to **Public** and save. Use the
   actual project-page URL itch.io gives you when sharing the app.

These settings follow [itch.io's HTML game documentation](https://itch.io/docs/creators/html5).
The current ZIP is within its file-count and size limits. Browser requests from
the two supported itch.io game hosts are already allowed by the Supabase API.

## Future updates

Run from the project folder:

```sh
npm run package:itch
```

This rebuilds and replaces `dist/tubong-pinoy-itch.zip`. Upload the new ZIP in
the existing project's edit page, select it as the playable browser file, and
remove the obsolete upload after verifying the replacement. Account records
remain in Supabase.

The build uses relative asset paths. Hash navigation retains the explicit
index.html filename through links and reloads, including the CDN upload
subdirectory. Only compiled frontend files enter the ZIP; `.htaccess` and hidden
metadata are omitted. For the security details and shared-origin constraints,
see [the security checklist](security-deployment.md).
