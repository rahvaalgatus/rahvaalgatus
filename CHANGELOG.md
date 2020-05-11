## May 11, 2020
- Removes all dependencies on the CitizenOS PostgreSQL database.

## Mar 30, 2020
- Adds a dedicated page for students and others to try digital signatures.
- Adds a graph for plotting the number of 16–20 year-olds that have tried digital signing on that dedicated page.

## Jan 22, 2020
- Adds local user accounts with email confirmations.
- Temporarily removes initiative coauthor adding as its invitation mechanism relied on CitizenOS accounts.

## Jan 7, 2019
- Adds support for creating initiatives intended for the local government.
- Adds <https://kohalik.rahvaalgatus.ee> for local government initiatives.

## Oct 28, 2019
- Adds support for `TAVAPOST` letter medium when syncing with the Riigikogu API.

## Oct 24, 2019
- Adds a combined Atom feed for all initiatives and their events.

## Oct 21, 2019
- Adds a link-preview image to initiatives that social networks and messaging apps can then use for shared link previews.  
  It's uploadable from the admin interface.

## Oct 14, 2019
- Syncs documents in the parliament volume of the initiative.

## Oct 7, 2019
- Ensures events that were logically before or after others are displayed as such.  
  For example, "Sent to Parliament" should always come before "Parliament Received Initiative", even if the latter has its occurrence set to the midnight.

## Oct 6, 2019
- Adds support for matters of significant national importance events.
- Adds support for emailing subscribers when new initiative events were created via syncing.

## Oct 3, 2019
- Adds support for parliament board events.
- Adds support for parliament interpellation events.

## Sep 30, 2019
- Adds the last 6 initiatives signed or commented on to the top of the initiatives page.
- Adds the parliament committee and government agency names to the sidebar of the initiative page.

## Sep 29, 2019
- Adds all event types to the Atom feed.

## Sep 27, 2019
- Adds the `/statistics` public API endpoint.

## Sep 23, 2019
- Adds statistics to the home page.
- Adds logos to the donate page.
- Permits editing all initiative subscriptions together.  
  Links in the footer of notification emails lead to the subscriptions editing page.

## Sep 16, 2019
- Adds "sent to government" event to the initiative page.
- Adds "finished in government" event to the initiative page.

## Sep 15, 2019
- Adds parliament committee and government agency names to the phase-bar on initiative page.

## Sep 14, 2019
- Fixes the message shown after signing an initiative twice.

## Sep 9, 2019
- Distinguishes official initiative events from ones initiative authors have added.

## Sep 8, 2019
- Adds committee name to parliament acceptance events.
- Improves performance of initiative page by bypassing the CitizenOS API.

## Aug 29, 2019
- Adds support for parliament letters through "DHX".
- Imports initiatives from the [parliament's collective addresses web page](https://www.riigikogu.ee/tutvustus-ja-ajalugu/raakige-kaasa/esitage-kollektiivne-poordumine/riigikogule-esitatud-kollektiivsed-poordumised/).

## Jul 23, 2019.
- Adds [Riigikogu API](https://github.com/riigikogu-kantselei/api) syncing to fetch parliament proceedings and documents.
- Imports external initiatives and their texts from the Riigikogu API.

## Jul 10, 2019
- Adds initiative archiving.  
  Archival status is currently only shown on the phase visualization for initiatives that reached the `done` phase.
