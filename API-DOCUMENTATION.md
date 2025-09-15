List of DoW 1: DE Player/Match Stats Web API Resources
I decided to document a large amount of the DoW 1: DE Player/Match stats API as Relic's official post about it doesn't go into detail.

Community API

Base URL:
https://dow-api.reliclink.com/community/leaderboard/
https://dow-api.reliclink.com/community/advertisement/
https://dow-api.reliclink.com/community/external/
https://dow-api.reliclink.com/community/achievement/
https://dow-api.reliclink.com/community/news/
https://dow-api.reliclink.com/community/clan/
https://dow-api.reliclink.com/community/CommunityEvent/
https://dow-api.reliclink.com/community/item/

Endpoints:
getAvailableLeaderboards
getleaderboard2
getRecentMatchHistory
getRecentMatchHistoryByProfileId
getPersonalStat
findAdvertisements
proxysteamuserrequest
GetAvatarStatForProfile
getAchievements
getAvailableAchievements
getNews
find
getClanInfoFull
getAvailableCommunityEvents
getInventoryByProfileIDs

Params:
title=<dow_game_name>
leaderboard_id=<int>
profile_names=["/steam/<steamID64>", "/steam/<steamID64>", "/steam/<steamID64>"]
profile_id=<relic_id>
aliases=["<profile_name>", "<profile_name>", "<profile_name>"]
count=<int>
start=<int>
sortBy=<int>
request=<string>
profileNames=["/steam/<steamID64>", "/steam/<steamID64>", "/steam/<steamID64>"]
profileids=["<int>"]
joinPolicies=["<int>","<int>","<int>"]
name=<string>
tags=["<string>","<string>","<string>"]

Example usage:
https://dow-api.reliclink.com/community/leaderboard/getAvailableLeaderboards?title=dow1-de

https://dow-api.reliclink.com/community/leaderboard/getleaderboard2?count=200&leaderboard_id=1&start=1&sortBy=1&title=dow1-de

https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=["Reuben"]

https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistoryByProfileId?title=dow1-de&profile_id=10729783

https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=["/steam/76561198029454731"]

https://dow-api.reliclink.com/community/advertisement/findAdvertisements?&title=dow1-de

https://dow-api.reliclink.com/community/external/proxysteamuserrequest?request=/ISteamUser/GetPlayerSummaries/v0002/&title=dow1-de&profile_ids=10007134&profileNames=[%22/steam/76561198029454731%22]

https://dow-api.reliclink.com/community/leaderboard/GetAvatarStatForProfile?title=dow1-de&profile_names=[%22/steam/76561198029454731%22]

https://dow-api.reliclink.com/community/achievement/getAchievements?title=dow1-de&profileids=[%2210007134%22]

https://dow-api.reliclink.com/community/achievement/getAvailableAchievements?title=dow1-de

https://dow-api.reliclink.com/community/news/getNews?title=dow1-de

https://dow-api.reliclink.com/community/clan/find?title=dow1-de&joinPolicies=[%220%22]&name=name&tags=[%22tag1%22]&start=0&count=0

https://dow-api.reliclink.com/community/clan/getClanInfoFull?title=dow1-de&name=name

https://dow-api.reliclink.com/community/CommunityEvent/getAvailableCommunityEvents?title=dow1-de

https://dow-api.reliclink.com/community/item/getInventoryByProfileIDs?title=dow1-de&profileids=[%2210007134%22]



Information

Use Case:
Use the API to populate a third-party leaderboard website or extension with player stats and match data, get real-time match information with an app or directly compete with friends by comparing stats with the JSON response.

Notes:
Manually select, copy and paste the URLs above into your API client (my profile IDs are used for examples) as Steam's formatting breaks the links.

This list only contains GET methods, I'll not be documenting POST methods as such requests have the propensity to be abused.

Some request require temporary session tokens to access which needs MITM tools to decrypt TLS traffic (when playing the game) and find said tokens (i.e. Wireshark with the TLS secret logger set up).

Some requests will only return response bodies with useful key-value pairs depending on the the title param value used in the request.

The API is structured similarly for most of Relic Entertainment's games, there's more endpoints and parameters available that can be found but the above is more than enough to get started on building a project for anyone who's interested.