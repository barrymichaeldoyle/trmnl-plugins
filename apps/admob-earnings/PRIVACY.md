# AdMob Earnings for TRMNL: privacy policy

Last updated: 8 October 2026

AdMob Earnings for TRMNL ("the recipe") is an independent TRMNL plugin by Barry Michael Doyle. It shows your Google AdMob estimated earnings on your TRMNL e-ink display. It is not affiliated with or endorsed by Google.

## What the recipe accesses

When you connect Google, the recipe asks for one permission: `https://www.googleapis.com/auth/admob.report` ("See your AdMob data"). It uses it for two requests to the AdMob API:

- the list of AdMob accounts you can access (publisher ID, reporting currency and time zone), so you can choose which account to show;
- a daily estimated-earnings report for the chosen account covering roughly the last three months.

It does not read your apps, ad units, mediation settings, payments, or any other Google data, and it cannot change anything in your AdMob account.

## Where data goes

The recipe has no server of its own. TRMNL runs it: TRMNL stores your Google sign-in tokens, calls the AdMob API on your behalf on the schedule you choose, and turns the report into the image shown on your device. The author of the recipe never receives your tokens, your publisher ID or your earnings.

Your data is used only to render your own screen. It is not sold, shared with third parties, or used for advertising. TRMNL's own handling of plugin data is described in [TRMNL's privacy policy](https://trmnl.com/privacy).

## Google API Services User Data Policy

The recipe's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Removing access

You can disconnect at any time by removing the plugin or disconnecting Google in its TRMNL settings, or by revoking "AdMob Earnings for TRMNL" at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Once access is revoked, no further AdMob data is fetched.

## Contact

Questions: barry@barrymichaeldoyle.com, or open an issue at <https://github.com/barrymichaeldoyle/trmnl-plugins/issues>.
