Is it possible to capture a picture of a Starlink dish's surroundings
using the history data it exposes? The scripts and such in this repo
are what I have pulled together to find out.

There are three phases in this process, and the scripts for each phase
are separated into the three subdirectories:

 * `downloader` collects data from the dish
 * `reducer` aggregates the data into a useful format
 * `viewer` presents a visual representation of the aggregated data

These scripts were developed on a Mac running macOS 11.1. They use
`zsh`. I /think/ there's nothing zsh-specific about them (so they may
also work as bash), but I haven't tested. The scripts use `grpcurl`
and `jq`, so you'll want those installed.

## Downloader / collection

The Starlink dish presents a GRPC endpoint that Starlink's apps use to
fetch the data they display. For more information about the requests
and responses this endpoint serves, I recommend looking through the
[sparky8512/starlink-grpc-tools](https://github.com/sparky8512/starlink-grpc-tools)
repo. The main request/response pair this repo cares about is
`get_history`/`dishGetHistory`.

In the downloader directory, you'll find the `fetch-data.sh`
script. This is a simple wrapper around `grpcurl` that downloads a
JSON-ified `dishGetHistory` response into a file named for the
date-time it was downloaded (YYYY-MM-DD-HHMMSS.json).

Also in the downloader directory is the file
`StarlinkData.plist`. This is a launchd definition to run
`fetch-data.sh` periodically. To use it:

 1. Copy `StarlinkData.plist` to `~/Library/LaunchAgents`
 
 2. Edit `~/Library/LaunchAgents/StarlinkData.plist` to correct the
    path to the `fetch-data.sh` script (i.e. replace
    `/Users/bryan/projects` with wherever you downloaded this repo).
    
 3. Run `launchd load ~/Library/LaunchAgents/StarlinkData.plist`

The file is set up to download history data at three minutes past the
hour, every hour. If your Mac is asleep when one or more downloads are
supposed to happen, they will be skipped, and instead one download
will happen as soon as your Mac wakes up. Each download contains the
last 12 hours of data, so as long as your Mac is awake once every 12
hours, you won't miss any data. Each download is a little under 4mb,
so even if your Mac does every download, you'll still consume less
than 100mb per day.

If you want to stop collecting data, run `launchd unload
~/Library/LaunchAgents/StarlinkData.plist`.


## Reducer / aggregation

Once you have one or more downloads, you'll need to reprocess it into
the format that the viewer wants to use. That's done with the scripts
in the `reducer` directory.

Assuming you have several downloads in a `data/` directory:

 1. `cd data/`
 2. `../reducer/extract-unique-times.zsh ../extract ../data/*`

This should produce an equal number of identically-named files in the
`extract` directory. These files have four major changes:

 1. All information about throughput is removed

 2. Information about ping drops, signal-to-noise ratio, obstructions,
    an satellite schedules are aggregated into one array of objects,
    instead of four separate arrays.

 3. Ring buffers are unraveled, so that the earliest data in the file
    is the first element of the `data` array, and the latest data is
    the last.

 4. Data is deduped. That is, data present in the second extracted
    file includes only data that was not present in the first
    extracted file. Put another way, any overlap is removed such that
    after the first file, each file only represents the data that was
    added in the new download.

Aggregate all of your extractions, and prepare them for viewing using
the other script in the `reducer/` directory:

 1. `cd ..`
 1. `reducer/concatenate-extracted-data.zsh extracted/* > viewer/viewer-data.json`

## Viewer / visual presentation

The viewer is an HTML/SVG app. Start a webserver with the `viewer/`
directory as its root. One easy way to do this:

 1. `cd viewer/`
 2. `python3 -m http.server`

Open the page in your web browser: (http://localhost:8000/index.html)

If the page loads correctly, you should see a handful of buttons and
fields at the top, and a large white space with a bunch of red squares
on it below that.

Each red square is a 1-second interval where some number of pings was
dropped, and the dish reported that they were dropped because of some
obstruction. The more opaque the red, the more pings were dropped.

Consequtive seconds run from left to right, and then wrap around to
start again at the left on the next line down. The "stripe" field
determines how many seconds are placed on each line. The "offset"
field determines how many seconds to skip at the start of the
data. The left-hand "box size" field determines the width of each
rectangle, and the right-hand field determines the height. Buttons to
the side of each field will increase or decrease the value of the
field, or you can type the value you want.

The checkboxes determine which data is displayed.

 * "obstructed": When the dish thought its view of the satellite was
   obstructed. Rectangles will be red.

 * "beta downtime": When the dish thought there should be a satellite
   available, but it was not responsive. Rectangles will be blue.

 * "no satellites": When the dish did not expect to have a satellite
   available. Rectangles will be green.

 * "signal-to-noise ratio": The dish's measurement of the
   signal-to-noise ratio. Rectangles will be darker grey when the
   signal was low and the noise was high.

 * "connected": Highlight areas where a connection was maintained at
   the specified quality for the at least the specified time.

A few text fields near these checkboxes alter how much of each
category is displayed:

 * "min loss ratio": Determines what ratio of pings must be dropped in
   a sample in order for it to be rendered in the chart. The default
   of 1 means "all pings must be dropped", which seems to be the
   metric that Starlink uses for counting downtime. Valid values are
   decimals between 0 and 1.

 * "max snr": Determines highest signal-to-noise ratio worth
   rendering. The default of 0 renders only the darkest grey boxes,
   when signal is completely absent. Valid values are 0 to 9.

 * "Min Clear Sec": The number of contiguous seconds that must elapse
   for a region to be highlighted as connected (part one of "the
   specified quality")

 * "Max Down Sec": The number of contiguous seconds in which ping loss
   is equal to or higher than "min loss ratio" before a contiguous
   connected region is considered broken.

The connected highlighting may be best explained by an example. If
highlighting is enabled with "obstructed" enabled, "min loss ratio" at
1, "Min Clear Sec" at 1800, and "Max Down Sec" at 2, then any region
highlighted is a region at least 30 minutes long in which no
obstruction causing total ping loss for more than two seconds
occurred. This example is a metric I'm using to quantify how often a
good-quality medium-length video call is possible.

If you place your mouse over the rendering, a tooltip will display the
offset into the data array, as well as the date and time of that
sample, at the position of your pointer.

A histogram is rendered below the timeseries chart. This histogram
shows the count of the number of times a span of each type, for the
given duration, was observed. Colors are the same as the timeseries
graph. Example: If a red bar of height 10 at the "1s" mark is
displayed, that means that a one-second obstruction was observed 10
times in the data. A blue bar of height 1 at the "10m" mark is
displayed, one ten-minute-long beta downtime was observed.

The histogram obeys the same filtering rules as the timeseries data,
except instea of shading, any sample that would have been rendered is
added to any span to which it is adjacent. That is, if "min loss
ratio" is set to 0.5, and over three seconds an obstruction causes
ping losses of 0.75, 1, and 0.9, a three-second obstruction span will
be recorded.

Connection spans also obey the same filtering rules as the timeseries
data. If "Max Down Sec" is set to 2, then outages (of any type,
including mixed-cause) lasting two seconds or less will not interrupt
a connection. For example, two 5-second spans of connectivity
interrupted by a 1-second span of beta downtime will be recorded as
one 11-second span of connectivity (5 + 5 + 1). The one-second beta
downtime will also be counted, since that area of the graph can be
ignored without affecting other data. "Min Clear Sec" is ignored for
the purposes of the histogram, since recording smaller spans here does
not prevent charting longer spans.

## Results

The idea behind the viewer is that the beam between the dish and the
satellite is something like a CRT, sweeping across the scenery as the
satellite moves past. If the satellites are moving in semi-constant
rings, while the earth turns beneath them, then each successive
satellite in a ring passes just a little lower on the west horizon, or
just a little higher on the east horizon. This should produce a
succession of sweeps across the scene. If the dish connects to the
next dish in the ring at a regular interval, then syncing up the sweep
with the viewer should produce a scan of that region of the sky.

Updates on what I've found so far are shared at
(http://blog.beerriot.com/2021/02/14/starlink-raster-scan/).
