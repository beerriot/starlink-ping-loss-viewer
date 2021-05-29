What can we learn by looking more closely at a Starlink dish's history
of connection data? The scripts and such in this repo are what I have
pulled together to find out.

There are two phases in this process, and the scripts for each phase
are separated into the two subdirectories:

 * `downloader` collects data from the dish
 * `viewer` presents a visual representation of the aggregated data

These scripts were developed on a Mac running macOS 11.1 and a
Raspberry Pi running Raspian 10 (buster). Some use `zsh`. I /think/
there's nothing zsh-specific about them (so they may also work as
bash), but I haven't tested. The scripts use `grpcurl` and `jq` and
`python3`, so you'll want those installed.

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

### MacOS download automation

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

### Linux download automation

Also in the downloader directory is the file `crontab`. This is an
example crontab specification to run the `fetch-data.sh` script a few
times per day.

## Viewer / visual presentation

The viewer is an HTML/SVG app. It uses a small Python script to serve
the collected data files to the app. If your data is stored in a
directory named `/path/to/your/data`, start the Python script like so:

 1. `cd viewer/`
 2. `./server.py starlink:/path/to/your/data`

If you have more than one directory containing data you'd like to view, pass additional arguments to `server.py`. The `starlink` before the colon in the example above is the name of that data that will show up above the file selection list in the viewer. Give each path a different name (e.g. `./server.py startlink:/path/to/starlink-data DSL:/path/to/dsl-data hotspot:/path/to/hotspot-data`).

Open the page in your web browser: (http://localhost:8000/index.html)

If the page loads correctly, you should see a list of your collected
data files in a box at the upper left. Click on any file to view
it. If you select several files at once (via clicking and dragging,
shift-clicking, command-clicking, or other means), the timespan they
cover will be rendered together. The "current" entry at the top of the
list will request a fresh dump of data from the dish.

If the rendering is successful, then below the selection box and the
fields next to it at the top at the top, a large white space with a
bunch of colored squares will appear.

Each red square is a 1-second interval where some number of pings was
dropped, and the dish reported that they were dropped because of some
obstruction. The more opaque the red, the more pings were dropped.

Consequtive seconds run from left to right, and then wrap around to
start again at the left on the next line down. The "stripe" field
determines how many seconds are placed on each line. The "offset"
field determines how many seconds to skip at the start of the
data. The left-hand "box size" field determines the width of each
rectangle, and the right-hand field determines the height.

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

 * "min downlink bps" and "min uplink bps": Each of these overrides
   the the decision of whether or not to show an outage, based on the
   measured downlink or uplink throughput. If downlink throughput for
   the second was higher than "min downlink bps", the outage is not
   rendered. If uplink throughput for the second was higher than "min
   uplink bps", the outage is not rendered.

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

Below the histogram is a table of "adjacencies". Each cell counts the
number of times where a span of the type of that row abuts a span of
the type of that column. Percentages are of the total adjacencies for
the row.

Below the adjacencies table is a table of "overrulings". This provides
a count of the number of times that downlink or uplink throughput was
high enough to decide that a high ping loss rate did not indicate a
lack of connection. The "downlink" and "uplink" counts are independent
- if both rates were high enough, the overruling is counted in both
columns. The "either" count is the total number of overrulings (count
an overruling by both downlink and uplink rate only once), and the
"not" count is the number of outages that were still counted.

## Reducer / aggregation

If you would like to reclaim some disk space, a tool is included for
removing the duplicated samples in each hour's data file. That tool is
in the `reducer/` directory.

To use it, first change to the directory where your data files live,
then run `reducer/extract-unique-times.zsh`, passing as its first
argument the directory where you would like the deduped data to end up
(don't use "." because you'll overwrite the files there), and passing
as its second through Nth arguments the files that you would like to
deduplicate.

For example, if I wanted to deduplicate all files for February 2021
from my `data/` directory into my `dedupe/` directory, I would do the
following:

 1. `cd data/`
 2. `../reducer/extract-unique-times.zsh ../dedupe 2021-02*.json`

In addition to removing duplicate data, ring buffers are unraveled, so
that the oldest sample is always the first in the arrays, and the
newest data is always the last.

## Results

The original idea behind the viewer wass that the beam between the dish
and the satellite is something like a CRT, sweeping across the scenery
as the satellite moves past. If the satellites are moving in
semi-constant rings, while the earth turns beneath them, then each
successive satellite in a ring passes just a little lower on the west
horizon, or just a little higher on the east horizon. This should
produce a succession of sweeps across the scene. If the dish connects
to the next dish in the ring at a regular interval, then syncing up
the sweep with the viewer should produce a scan of that region of the
sky.

It didn't quite work out, as you can read at
(http://blog.beerriot.com/2021/02/14/starlink-raster-scan/). But, I've
been using the viewer to continue to get a clearer picture of the
quality of my connection.

## Pinger

Recently added is another utility in the `pinger/` subdirectory. This
is intended to be a quick-hack way to compare the connectedness of a
non-starlink connection.

The main script in the subdirectory, `collect-pings.py` pings 8.8.8.8
once per second. Every 3600 pings (approximately once per hour), it
writes a file to disk that records which of those pings succeeded. The
file is not exactly the same format as Starlink's history response,
but the `ping_returncode` field is close enough to `popPingDropRate`
to allow the viewer to render it in the same format.

The other two files in the subdirectory are support to keep this ping
recording utility running in the background. The
`background-collection.sh` script checks for a running
`collect-pings.py` and starts a new one if it doesn't find one. The
check is performed by writing the PID of the `collect-pings.py`
process to a file, and then querying for that PID. The `crontab` file
contains an example of how to automatically run
`background-collection.sh` to make sure `collect-pings.py` gets
restarted if it stops.