// Samples will be loaded here.
var data = null;

// The `addData` function expects field names to work with. Add field
// names from the dishGetHistory response here, to have them available
// for analysis and rendering.
function clearData() {
    data = {
        "downlinkThroughputBps": [],
        "popPingDropRate": [],
        "obstructed": [],
        "scheduled": [],
        "snr": [],
        "uplinkThroughputBps": [],

        // computed, not read from file

        // Time between data dumps.
        "unrecorded": [],

        // Time reclassified from adjacent beta downtime
        "adjacentObstructed": []
    };
}

// What values to put in the arrays above during periods where we have
// no data. All fields added to `data` must be present here.
let unrecordedTemplate = {
    "downlinkThroughputBps": 0,
    "popPingDropRate": 1,
    "obstructed": false,
    "scheduled": true,
    "snr": 9,
    "uplinkThroughputBps": 0,

    "unrecorded": true,
    "adjacentObstructed": false
};

// Remember the last "current" (== uptime) value from the most
// recently loaded file in the selected list, so we don't re-add that
// data when consuming the next file.
var lastUptime = null;

// The date we read determined the last consumed file was written.
var lastFiledate = null;

// Datetime of earliest sample.
var startdate = null;

// Spans of uninterrupted connectivity. Computed by analyzing `data` at plot time.
var connectedSpans = null;
// Histogram of span lengths. Computed by analyzing `data` at plot time.
var spanHisto = null;
// Map of how often each span type abuts another.
var adjacencies = null;
// How often a betadowntime of length N was reclassified as obstruction.
var betaReclassifiedHisto = null;

// How many times downlink/uplink throughput overruled ping loss ratio.
var outagesOverruled = null;

// Rendering parameters are functions with captured values. The
// function alters the captured value by the passed amount, and
// returns the result after constraining it to the minimum and maximum
// configured at creation. Call with no parameters to read the value
// without modification.
function constrainedValue(min, max, clearsConnectivity = true) {
    var currentValue =
        Math.min(max != null ? max : Number.MAX_SAFE_INTEGER,
                 Math.max(min != null ? min : Number.MIN_SAFE_INTEGER))
    return function(change = 0) {
        if (change != 0 && clearsConnectivity) {
            connectedSpans = null;
            spanHisto = null;
        }

        currentValue += change
        if (min != null) {
            currentValue = Math.max(currentValue, min);
        }
        if (max != null) {
            currentValue = Math.min(currentValue, max);
        }
        return currentValue;
    }
};

// Samples per row.
var stripeLengthV = constrainedValue(1, null, false);
stripeLengthV(1199); // 1 + 1199 == 1200 (20 minutes)

// Which sample to start the plot with. (init == 0)
var offsetV = constrainedValue(0, null, false);

// Size of a rendered sample. (default 1x1)
var boxWidthV = constrainedValue(1, null, false);
var boxHeightV = constrainedValue(1, null, false);

// Which items to display.
var display = {
    "obstructed": true,
    "adjacentObstructed": false,
    "betadown": true,
    "nosatellite": false,
    "snr": false,
    "connected": false,
    "unrecorded": true
};

var colors = {
    obstructed: "#ff0000",
    betadown: "#0000ff",
    nosatellite: "#00ff00",
    snr: "#999999",
    connected: "#ffee00",
    unrecorded: "#333333"
};

// Smallest data.popPingDropRate[i] to render.
var minLossRatioV = constrainedValue(0, 1);
minLossRatioV(1);

// Smallest data.downlinkThroughputBps[i] that overrides minLossRatio.
var minDownBpsV = constrainedValue(0);
minDownBpsV(1000000); // 1mbps

// Smallest data.uplinkThroughputBps[i] that overrides minLossRatio.
var minUpBpsV = constrainedValue(0);
minUpBpsV(1000000); // 1mpbs

// Largest data.snr[i] to render. (init == 0)
var maxSnrV = constrainedValue(0, 9);

// What constitues a connected region.
var connectedMinSecV = constrainedValue(1);
connectedMinSecV(1799); // == 1 + 1799 == 1800
var connectedMaxDSecV = constrainedValue(0);
connectedMaxDSecV(2);

function attachButtons(prefix, value, textInput, replot = plot) {
    var buttons = {
        "minus30": -30,
        "minus10": -10,
        "minus1": -1,
        "plus1": 1,
        "plus10": 10,
        "plus30": 30
    };
    var thunker = function(change) {
        return function() {
            var newVal = value(change);
            textInput.value = newVal;
            replot();
        }
    };
    for (var key in buttons) {
        var b = document.getElementById(prefix+"_"+key);
        if (b) {
            b.addEventListener("click", thunker(buttons[key]));
        }
    }
}

function inputChangeThunk(input, setter, parser = parseInt) {
    return function() {
        var newVal = parser(input.value)
        if (!isNaN(newVal)) {
            setter(newVal)
            plot()
        }
    }
}

function attachInput(name, value, parser = parseInt, replot = plot) {
    var input = document.getElementById(name);

    // Display the initial value
    input.value = value()

    input.addEventListener("change", function() {
        var newVal = parser(input.value);
        if (!isNaN(newVal)) {
            // The value function takes a change, not an absolute. So
            // compute the delta between its current value and the new
            // value, and send that as the change.
            input.value = value(newVal + (-1 * value()));
            replot();
        } else {
            // If the input was invalid, replace it with what is
            // already stored. No need to re-render.
            input.value = value();
        }
    });

    return input;
}

attachButtons("stripeLength", stripeLengthV,
              attachInput("stripeLength", stripeLengthV));
attachButtons("offset", offsetV,
              attachInput("offset", offsetV));
attachButtons("boxWidth", boxWidthV,
              attachInput("boxWidth", boxWidthV, parseInt, rescale), rescale);
attachButtons("boxHeight", boxHeightV,
              attachInput("boxHeight", boxHeightV, parseInt, rescale), rescale);
attachInput("minLossRatio", minLossRatioV, parseFloat);
attachInput("minDownBps", minDownBpsV, parseFloat);
attachInput("minUpBps", minUpBpsV, parseFloat);
attachInput("maxSnr", maxSnrV, parseFloat);
attachInput("connectedMinSec", connectedMinSecV);
attachInput("connectedMaxDSec", connectedMaxDSecV);

function attachCheckbox(name) {
    var checkbox = document.getElementById(name);
    if (display[name]) {
        checkbox.setAttribute("checked", true)
    }
    checkbox.addEventListener("change", function() {
        display[name] = checkbox.checked
        connectedSpans = null;
        spanHisto = null;
        plot()
    })
}
attachCheckbox("obstructed");
attachCheckbox("betadown");
attachCheckbox("nosatellite");
attachCheckbox("snr");
attachCheckbox("connected");
attachCheckbox("adjacentObstructed");

function makeBox(width, height, x, y, color, opacity) {
    var box = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    box.setAttribute("x", x)
    box.setAttribute("y", y)
    box.setAttribute("width", width)
    box.setAttribute("height", height)
    box.setAttribute("fill", color)
    box.setAttribute("fill-opacity", opacity)
    return box
}

function makeSpans(stripeLength, start, end, color, opacity) {
    if (end-start == 1) {
        // Auto-handling 1-second "spans" makes the rest of the code simpler.
        return [makeBox(1, 1, (start % stripeLength),
                        Math.floor(start / stripeLength),
                        color, opacity)];
    }

    var nextEdge = (start % stripeLength == 0) ? start :
        start + stripeLength - (start % stripeLength);
    var prevEdge = end - (end % stripeLength)

    var spans = [];

    if (start < nextEdge) {
        // Span does not begin at graph edge. Draw partial row.
        var width = (Math.min(nextEdge, end) - start);
        var boxX = (start % stripeLength)
        var boxY = Math.floor(start / stripeLength);
        spans.push(makeBox(width, 1, boxX, boxY, color, opacity));
    }

    if (nextEdge < prevEdge) {
        // There is a segment of the span that wraps edge to edge.
        var width = stripeLength;
        var height = ((prevEdge - nextEdge) / stripeLength);
        var boxX = 0;
        var boxY = Math.floor(nextEdge / stripeLength);
        spans.push(makeBox(width, height, boxX, boxY, color, opacity));
    }

    if (prevEdge < end && prevEdge > start) {
        // Span does not end at graph edge. Draw partial row.
        var width = (end - prevEdge);
        var boxX = 0;
        var boxY = Math.floor(prevEdge / stripeLength);
        spans.push(makeBox(width, 1, boxX, boxY, color, opacity));
    }

    return spans;
}

function dropType(i) {
    return data.unrecorded[i] ? "unrecorded" :
        (!data.scheduled[i] ? "nosatellite" :
         (data.obstructed[i] ? "obstructed" :
          (display.adjacentObstructed && data.adjacentObstructed[i] ?
           "obstructed" : "betadown")))
}

function shouldShowDropAt(index, minLossRatio, minDownBps, minUpBps) {
    return display[dropType(index)] &&
        (data.popPingDropRate[index] >= minLossRatio) &&
        (data.downlinkThroughputBps[index] < minDownBps) &&
        (data.uplinkThroughputBps[index] < minUpBps);
}

function dataLength() {
    // We're not keeping track of length explicitly. All arrays in
    // data are the same length, so just return the length of any of
    // them.
    return data.popPingDropRate.length;
}

function rescale() {
    var viewer = document.getElementById("viewer");
    viewer.setAttribute("width", boxWidthV()*stripeLengthV());
    viewer.setAttribute("height", boxHeightV()*Math.ceil(dataLength()/stripeLengthV()));
    var spanGroup = viewer.getElementById("spans");
    spanGroup.setAttribute("transform", "scale("+boxWidthV()+","+boxHeightV()+")");
}

function plot() {
    analyzeData()
    plotTimeseriesData()
    plotHistogramData()
    plotAdjacencies()
    plotOverrules()
}

function analyzeData() {
    if (connectedSpans != null && spanHisto != null && adjacencies != null) {
        // don't redo this work if we don't expect it to change
        return;
    }

    connectedSpans = [];

    // 59 second buckets, and 60 minute buckets
    spanHisto = new Array(119);

    // important: names must match `display` object fields
    // [instance count, total seconds]
    for (var i = 0; i < spanHisto.length; i++) {
        spanHisto[i] = {
            obstructed: [0,0],
            betadown: [0,0],
            nosatellite: [0,0],
            connected: [0,0],
            unrecorded: [0,0]
        };
    }

    adjacencies = {
        "obstructed": {"total": 0, "betadown": 0, "nosatellite": 0, "connected": 0, "unrecorded": 0},
        "betadown": {"total": 0, "obstructed": 0, "nosatellite": 0, "connected": 0, "unrecorded": 0},
        "nosatellite": {"total": 0, "obstructed": 0, "betadown": 0, "connected": 0, "unrecorded": 0},
        "connected": {"total": 0, "obstructed": 0, "betadown": 0, "nosatellite": 0, "unrecorded": 0},
        "unrecorded": {"total": 0, "obstructed": 0, "betadown": 0, "nosatellite": 0, "connected": 0}
    };

    outagesOverruled = {
        "obstructed": {down: 0, up: 0, either: 0, not: 0},
        "betadown": {down: 0, up: 0, either: 0, not: 0},
        "nosatellite": {down: 0, up: 0, either: 0, not: 0},
        "unrecorded": {down: 0, up: 0, either: 0, not: 0}
    };

    betaReclassifiedHisto = new Array(120);
    betaReclassifiedHisto.fill(0);

    var addAdjacency = function(from, to) {
        adjacencies[from][to] += 1;
        adjacencies[from].total += 1;
        adjacencies[to][from] += 1;
        adjacencies[to].total += 1;
    }

    // Memoization so we don't have to keep calling these in the loop.
    var connectedMinSec = connectedMinSecV();
    var connectedMaxDSec = connectedMaxDSecV();
    var minLossRatio = minLossRatioV();
    var minDownBps = minDownBpsV();
    var minUpBps = minUpBpsV();

    // Number of consecutive non-outage seconds up to i
    var connectedLength = 0;

    // Number of consecutive outage seconds (any type) up to i
    var totalDLength = 0;

    // Number of consecutive outage seconds of the same type up to i
    var dLength = 0;

    // Type of the outage at i (but mostly referenced before update, so i-1)
    var dType = null;

    for (var i = 0; i < dataLength(); i++) {
        if (!shouldShowDropAt(i, minLossRatio, minDownBps, minUpBps)) {
            if (shouldShowDropAt(i, minLossRatio, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)) {
                outagesOverruled[dropType(i)].either += 1;
                if (!shouldShowDropAt(i, minLossRatio, minDownBps, Number.MAX_SAFE_INTEGER)) {
                    outagesOverruled[dropType(i)].down += 1;
                }
                if (!shouldShowDropAt(i, minLossRatio, Number.MAX_SAFE_INTEGER, minUpBps)) {
                    outagesOverruled[dropType(i)].up += 1;
                }
            }
            if (dLength > 0) {
                addToHisto(dType, dLength);
                addAdjacency("connected", dType);
                dType = null;
                dLength = 0;
            }
            totalDLength = 0;
            connectedLength += 1;
        } else {
            totalDLength += 1;
            var newDType = dropType(i);
            outagesOverruled[newDType].not += 1;

            if (newDType == "obstructed") {
                data.adjacentObstructed[i] = true;
                var j = i-1;
                while (j >= 0) {
                    if (shouldShowDropAt(j, minLossRatio, minDownBps, minUpBps) &&
                        dropType(j) == "betadown" && !data.adjacentObstructed[j]) {
                        data.adjacentObstructed[j] = true;
                    } else {
                        j++;
                        break;
                    }
                    j--;
                }
                betaReclassifiedHisto[Math.min(i-j, betaReclassifiedHisto.length-1)] += 1;

                j = i+1;
                while (j < dataLength()) {
                    if (shouldShowDropAt(j, minLossRatio, minDownBps, minUpBps) &&
                        dropType(j) == "betadown" && !data.adjacentObstructed[j]) {
                        data.adjacentObstructed[j] = true;
                    } else {
                        j--;
                        break;
                    }
                    j++;
                }
                betaReclassifiedHisto[Math.min(j-i, betaReclassifiedHisto.length-1)] += 1;
            }

            if (totalDLength > connectedMaxDSec) {
                if (connectedLength > 0) {
                    addToHisto("connected", connectedLength);
                    addAdjacency("connected", newDType);
                }
                if (connectedLength >= connectedMinSec) {
                    connectedSpans.push({"start":i-connectedLength, "end":i});
                }
                connectedLength = 0;
            } else {
                connectedLength += 1;
            }

            if (dType == null) {
                dType = newDType;
            } else if (dType != newDType) {
                addToHisto(dType, dLength);
                addAdjacency(dType, newDType);
                dType = newDType;
                dLength = 0;
            }
            dLength += 1;
        }
    }

    if (connectedLength > 0) {
        addToHisto("connected", connectedLength);
        if (connectedLength >= connectedMinSec) {
            connectedSpans.push({"start":dataLength()-connectedLength,
                                 "end":dataLength()});
        }
    } else if (dLength > 0) {
        addToHisto(dType, dLength);
    }
}

function plotTimeseriesData() {
    var viewer = document.getElementById("viewer")
    if (viewer) {
        viewer.remove();
    }

    // Memoize current values, so we don't have to call their
    // functions data[k].length times.
    var stripeLength = stripeLengthV();
    var offset = offsetV();
    var minLossRatio = minLossRatioV();
    var minDownBps = minDownBpsV();
    var minUpBps = minUpBpsV();
    var maxSnr = maxSnrV();

    viewer = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    viewer.setAttribute("id", "viewer")
    var width = stripeLength * boxWidthV();
    viewer.setAttribute("width", width)
    var height = Math.ceil(dataLength() / stripeLength) * boxHeightV()
    viewer.setAttribute("height", height)

    var spanGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    spanGroup.setAttribute("id", "spans");
    spanGroup.setAttribute("transform", "scale("+boxWidthV()+","+boxHeightV()+")");
    viewer.append(spanGroup);

    var appendSpans = function(spans) {
        for (var j = 0; j < spans.length; j++) {
            spanGroup.append(spans[j]);
        }
    };

    if (display["connected"]) {
        if (connectedSpans == null) {
            console.log("No connected span data to plot!");
        } else {
            for (var i = 0; i < connectedSpans.length; i++) {
                appendSpans(makeSpans(stripeLength,
                                      connectedSpans[i].start-offset,
                                      connectedSpans[i].end-offset,
                                      colors.connected, 1));
            }
        }
    }

    // accumulators for drop spans
    var dType = null;
    var dLevel = null;
    var dLength = 0;

    // accumulators for snr
    var snrLevel = null;
    var snrLength = 0;

    for (var i = offset; i < dataLength(); i++) {
        var oi = i-offset;
        if (display["snr"] && data.snr[i] <= maxSnr) {
            if (data.snr[i] != snrLevel) {
                // snr span ended in a different snr level
                if (snrLevel != null) {
                    appendSpans(makeSpans(stripeLength,
                                          oi-snrLength, oi,
                                          colors.snr, 1-(snrLevel/9)));
                }
                snrLevel = data.snr[i];
                snrLength = 1;
            } else {
                snrLength += 1;
            }
        } else if (snrLevel != null) {
            // snr span ended in no snr plot
            appendSpans(makeSpans(stripeLength,
                                  oi-snrLength, oi,
                                  colors.snr, 1-(snrLevel/9)));
            snrLevel = null;
            snrLength = 0;
        }

        if (shouldShowDropAt(i, minLossRatio, minDownBps, minUpBps)) {
            var newDType = dropType(i);
            if (newDType != dType || data.popPingDropRate[i] != dLevel) {
                // drop span ended in a new drop span
                if (dType != null) {
                    appendSpans(makeSpans(stripeLength,
                                          oi-dLength, oi,
                                          colors[dType], dLevel));
                }
                dType = newDType;
                dLevel = data.popPingDropRate[i];
                dLength = 1;
            } else {
                dLength += 1;
            }
        } else if (dType != null) {
            // drop span ended in a non-drop span
            appendSpans(makeSpans(stripeLength,
                                  oi-dLength, oi,
                                  colors[dType], dLevel));
            dType = null;
            dLevel = null;
            dLength = 0;
        }
    }

    if (snrLevel != null) {
        // graph ended with an snr span
        appendSpans(makeSpans(stripeLength,
                              dataLength()-offset-snrLength,
                              dataLength()-offset,
                              colors.snr, 1-(snrLevel/9)));
    }

    if (dType != null) {
        // graph ended with an outage
        appendSpans(makeSpans(stripeLength,
                              dataLength()-offset-dLength,
                              dataLength()-offset,
                              colors[dType], dLevel));
    }

    var tooltip = document.createElementNS("http://www.w3.org/2000/svg", "g");
    tooltip.setAttribute("opacity", 0);
    var time = document.createElementNS("http://www.w3.org/2000/svg", "text");
    time.innerHTML = "hello";
    tooltip.append(time);
    viewer.append(tooltip);

    document.body.append(viewer)
    var mouseoffsetx = 10
    var mouseoffsety = 10

    viewer.addEventListener("mouseenter", function() {
        tooltip.setAttribute("opacity", 1);
    });
    viewer.addEventListener("mouseleave", function() {
        tooltip.setAttribute("opacity", 0);
    });
    viewer.addEventListener("mousemove", function(l) {
        var svgx = l.offsetX;
        var svgy = l.offsetY;
        tooltip.setAttribute("transform", "translate("+(svgx+mouseoffsetx)+","+(svgy+mouseoffsety)+")");

        var index = Math.floor(svgy/boxHeightV())*stripeLength + Math.floor(svgx/boxWidthV()) + offset;
        var hereDate = startdate ? new Date(startdate) : ""
        startdate && hereDate.setSeconds(hereDate.getSeconds() + index);
        time.innerHTML = index + " " + hereDate;
    });
}

function dateFromFilename(filename) {
    var dateparts = filename.match(/(\d\d\d\d)-(\d\d)-(\d\d)-(\d\d)(\d\d)(\d\d)/)
    if (dateparts && dateparts.length == 7) {
        return new Date(dateparts[1], parseInt(dateparts[2])-1, dateparts[3], dateparts[4], dateparts[5], dateparts[6]);
    }

    // date not parseable
    return null;
}

function addData(jsondata, start, end) {
    for (var k in data) {
        if (k == "unrecorded" || k == "adjacentObstructed") {
            // These are our own, not part of Dishy's metrics.
            var sim = new Array(end-start);
            sim.fill(false);
            data[k] = data[k].concat(sim);
        } else {
            data[k] = data[k].concat(jsondata.dishGetHistory[k].slice(start, end));
        }
    }
}

function ringbufferSize(jsondata) {
    // There is no explicit length field. All arrays are the same
    // length, so just return the length of one of them.
    return jsondata.dishGetHistory.popPingDropRate.length;
}

function addAllData(jsondata, uptime) {
    if (uptime < ringbufferSize(jsondata)) {
        addData(jsondata, 0, uptime);
    } else {
        var oldestPoint = uptime % ringbufferSize(jsondata);
        addData(jsondata, oldestPoint, ringbufferSize(jsondata));
        addData(jsondata, 0, oldestPoint);
    }
}

function addContinuedData(jsondata, uptime) {
    var leftOffAt = lastUptime % ringbufferSize(jsondata);
    var endOfLatest = uptime % ringbufferSize(jsondata);
    if (leftOffAt < endOfLatest) {
        // haven't wrapped the ring buffer
        addData(jsondata, leftOffAt, endOfLatest);
    } else {
        // have wrapped the ring buffer
        addData(jsondata, leftOffAt, ringbufferSize(jsondata));
        addData(jsondata, 0, endOfLatest);
    }
}

function addUnrecordedData(length) {
    var unrecordedValues = new Array(length);
    for (var k in data) {
        unrecordedValues.fill(unrecordedTemplate[k]);
        data[k] = data[k].concat(unrecordedValues);
    }
}

// Consume the raw grpcurl dishGetHistory response
function consumeFile(jsondata, filename) {
    var uptime = parseInt(jsondata.dishGetHistory.current);

    var filedate = dateFromFilename(filename);
    if (filedate == null) {
        console.log("Could not determine datetime of file");
    }

    if (lastUptime == null) {
        // our first file
        addAllData(jsondata, uptime);
    } else if (filedate != null && lastFiledate != null) {
        var secondsSinceDate = (filedate - lastFiledate) / 1000;
        if (lastUptime > uptime ||
            secondsSinceDate >= uptime ||
            secondsSinceDate >= ringbufferSize(jsondata)) {
            // Data in this file is unrelated to data in the previous file.

            var lostTime = Math.max(secondsSinceDate-uptime,
                                    secondsSinceDate-ringbufferSize(jsondata));
            if (lostTime > 0) {
                console.log("Found time lost during reset: "+lostTime+" seconds after "+lastFiledate);
                addUnrecordedData(lostTime);
            }

            addAllData(jsondata, uptime);
        } else {
            // This is just continuation of the data in the previous file.
            addContinuedData(jsondata, uptime);
        }
    } else {
        console.log("Warning: relying on uptime only from "+lastUptime+" to "+uptime+" in file "+filename);
        if (uptime - lastUptime > ringbufferSize(jsondata)) {
            // ring buffer overflowed, add missing and copy all
            addUnrecordedData(uptime - lastUptime - ringbufferSize(jsondata));
            addAllData(jsondata, uptime);
        } else if (uptime < lastUptime) {
            // system reset betweeen then and now
            console.log("Reset detected without date to work with at file "+filename);
            addAllData(jsondata, uptime);
        } else {
            // The happy path - uptime and lastUptime are related
            // and close enough to only need part of the ring
            // buffer.
            addContinuedData(jsondata, uptime);
        }
    }

    lastUptime = uptime;
    lastFiledate = filedate;

    if (startdate == null && filedate != null) {
        startdate = new Date(filedate);
        startdate.setSeconds(startdate.getSeconds() - dataLength());
    }
}

function addToHisto(type, seconds) {
    if (display[type]) {
        var b = Math.min(spanHisto.length-1,
                         seconds < 60 ? seconds-1 : 59 + Math.floor(seconds / 60));
        spanHisto[b][type][0] += 1;
        spanHisto[b][type][1] += seconds;
    }
}

function plotHistogramData() {
    if (spanHisto == null) {
        console.log("No histogram to plot!");
        return;
    }

    var normal = 0;
    for (var i = 0; i < spanHisto.length; i++) {
        for (var k in spanHisto[i]) {
            normal = Math.max(normal, spanHisto[i][k][0]);
        }
    }

    // make normal evenly divisible for four grid lines
    normal = normal + (4 - normal % 4);

    var histo = document.getElementById("histo")
    if (histo) {
        histo.remove();
    }

    var plotCount = (display.obstructed ? 1 : 0) +
        (display.betadown ? 1 : 0) +
        (display.nosatellite ? 1 : 0) +
        (display.connected ? 1 : 0);

    histo = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    histo.setAttribute("id", "histo");

    // 10 * 120 buckets = about my screen width
    var bucketWidth = 10;
    var graphWidth = bucketWidth * spanHisto.length;
    // bucketWidth-1 ensures a space between buckets
    var barWidth = (bucketWidth-1)/plotCount;
    var graphHeight = 200;

    var leftInset = 60;
    var rightInset = 10;
    var topInset = 10;
    var bottomInset = 50;
    var svgWidth = graphWidth + leftInset + rightInset;
    var svgHeight = graphHeight + topInset + bottomInset;
    histo.setAttribute("width", svgWidth);
    histo.setAttribute("height", svgHeight);

    var graph = document.createElementNS("http://www.w3.org/2000/svg", "g");
    // Flip the coordinate system upside down (while also shifting the
    // graph into position) to make the bar-creating code simpler.
    graph.setAttribute("transform", "matrix(1, 0, 0, -1, "+leftInset+", "+(graphHeight+topInset)+")");

    var yAxisLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yAxisLabel.textContent = "occurrences";
    yAxisLabel.setAttribute("text-anchor", "middle");
    yAxisLabel.setAttribute("transform", "rotate(-90)");
    yAxisLabel.setAttribute("x", -graphHeight/2);
    yAxisLabel.setAttribute("y", "11pt");
    yAxisLabel.setAttribute("font-size", "11pt");
    yAxisLabel.setAttribute("font-family", "Verdana");
    histo.append(yAxisLabel);

    var xAxisLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xAxisLabel.textContent = "outage/connection duration";
    xAxisLabel.setAttribute("text-anchor", "middle");
    xAxisLabel.setAttribute("x", leftInset + graphWidth / 2);
    xAxisLabel.setAttribute("y", svgHeight - 5);
    xAxisLabel.setAttribute("font-size", "11pt");
    xAxisLabel.setAttribute("font-family", "Verdana");
    histo.append(xAxisLabel);

    for (var l = 0; l <= 1; l += 0.25) {
        var grid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        var leftHang = 3;
        grid.setAttribute("x", -leftHang);
        grid.setAttribute("y", l * graphHeight);
        grid.setAttribute("width", leftHang + (l == 0 ? 0 : graphWidth));
        grid.setAttribute("height", 1);
        grid.setAttribute("fill", "#eeeeee");
        graph.append(grid);

        var gridlabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        gridlabel.innerHTML = (normal * l);
        gridlabel.setAttribute("x", leftInset);
        gridlabel.setAttribute("text-anchor", "end");
        gridlabel.setAttribute("y", topInset + graphHeight - (l * graphHeight));
        gridlabel.setAttribute("font-family", "Verdana");
        gridlabel.setAttribute("font-size", "9pt");
        gridlabel.setAttribute("dy", "3pt");
        gridlabel.setAttribute("dx", "-2pt");
        histo.append(gridlabel);
    }

    var addBar = function(bucketIndex, typeIndex, value, color) {
        var x = bucketIndex * bucketWidth + typeIndex * barWidth;
        var height = graphHeight * (value / normal);

        var bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", x);
        bar.setAttribute("width", barWidth);
        bar.setAttribute("y", 0);
        bar.setAttribute("height", height);
        bar.setAttribute("fill", color);
        graph.append(bar);
    }

    var addXTick = function(i, label) {
        var gridArrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        var basex = leftInset + i * bucketWidth;
        var arrowWidth = plotCount * barWidth;
        var basey = topInset + graphHeight;
        var arrowHeight = bucketWidth / 2
        gridArrow.setAttribute("points",
                               basex+","+basey+" "+
                               (basex+arrowWidth)+","+basey+" "+
                               (basex+arrowWidth/2)+","+(basey+arrowHeight));
        gridArrow.setAttribute("fill", "#eeeeee");
        histo.append(gridArrow);

        var gridlabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        gridlabel.textContent = label;
        gridlabel.setAttribute("x", leftInset + i * bucketWidth + bucketWidth/2);
        gridlabel.setAttribute("y", topInset + graphHeight + arrowHeight);
        gridlabel.setAttribute("font-family", "Verdana");
        gridlabel.setAttribute("font-size", "9pt");
        gridlabel.setAttribute("dy", "9pt");
        gridlabel.setAttribute("text-anchor", "middle")
        histo.append(gridlabel);
    }

    addXTick(0, "1s");
    for (var i = 0; i < spanHisto.length; i++) {
        if (i > 0 && i < 59 && i % 10 == 9) {
            addXTick(i, (i+1)+"s");
        } else if (i == 59) {
            addXTick(i, "1m");
        } else if (i > 59 && i % 10 == 8) {
            addXTick(i, (i-58)+"m");
        }

        barCount = 0;
        for (var k in spanHisto[i]) {
            if (display[k] && k != "unrecorded") {
                addBar(i, barCount, spanHisto[i][k][0], colors[k]);
                barCount += 1;
            }
        }
    }
    histo.append(graph);
    document.body.append(histo)
}

function plotAdjacencies() {
    if (adjacencies == null) {
        console.log("No adjacency data to plot!");
        return;
    }

    var table = document.getElementById("adjacencies");
    if (table != null) {
        table.remove();
    }

    table = document.createElement("table");
    table.setAttribute("id", "adjacencies");
    var caption = document.createElement("caption");
    caption.textContent = "Adjacenies (percentage of row that abut column)"
    table.append(caption);

    var types = ["obstructed", "betadown", "nosatellite", "connected"];

    var tr = document.createElement("tr");
    table.append(tr);
    tr.append(document.createElement("th"));
    for (var i = 0; i < types.length; i++) {
        var th = document.createElement("th");
        th.textContent = types[i];
        tr.append(th);
    }

    for (var r = 0; r < types.length; r++) {
        tr = document.createElement("tr");
        table.append(tr);
        var th = document.createElement("th");
        th.textContent = types[r];
        tr.append(th);
        for (var c = 0; c < types.length; c++) {
            var td = document.createElement("td");
            td.setAttribute("style", "text-align: right");
            if (r != c) {
                if (!display[types[r]] || !display[types[c]]) {
                    td.textContent = "-";
                } else {
                    var percent = Math.floor(
                        (adjacencies[types[r]][types[c]] / adjacencies[types[r]].total)
                            * 100 + 0.5);
                    td.textContent = adjacencies[types[r]][types[c]] +
                        " (" + percent + "%)";
                }
            }
            tr.append(td);
        }
    }
    document.body.append(table);

    table = document.getElementById("betaReclassifiedHisto");
    if (table) {
        table.remove();
    }
    
    table = document.createElement("table");
    table.setAttribute("id", "betaReclassifiedHisto");

    caption = document.createElement("caption");
    caption.textContent = "Beta Downtimes Reclassified as Obstructions";
    table.append(caption);

    var trh = document.createElement("tr");
    var trd = document.createElement("tr");
    table.append(trh);
    table.append(trd);
    for (var i = 1; i < betaReclassifiedHisto.length; i++) {
        th = document.createElement("th");
        th.textContent = i+"s";
        trh.append(th);

        td = document.createElement("td");
        td.textContent = betaReclassifiedHisto[i];
        trd.append(td);
    }
    document.body.append(table);
}

function plotOverrules() {
    if (outagesOverruled == null) {
        console.log("No overruling data to plot!");
        return;
    }

    var table = document.getElementById("overrules");
    if (table != null) {
        table.remove();
    }

    table = document.createElement("table");
    table.setAttribute("id", "overrules");
    var caption = document.createElement("caption");
    caption.textContent = "Outage Overrulings (either + not = total)"
    table.append(caption);

    var types = ["obstructed", "betadown", "nosatellite"];

    var tr = document.createElement("tr");
    var th = document.createElement("th");
    th.textContent = "Type";
    tr.append(th);
    th = document.createElement("th");
    th.textContent = "Overruled Sec (downlink)";
    tr.append(th);
    th = document.createElement("th");
    th.textContent = "Overruled Sec (uplink)";
    tr.append(th);
    th = document.createElement("th");
    th.textContent = "Overruled Sec (either)";
    tr.append(th);
    th = document.createElement("th");
    th.textContent = "Not Overruled Sec";
    tr.append(th);
    table.append(tr);

    for (var r = 0; r < types.length; r++) {
        tr = document.createElement("tr");
        table.append(tr);

        var td = document.createElement("td");
        td.textContent = types[r];
        tr.append(td);

        td = document.createElement("td");
        td.setAttribute("style", "text-align: right");
        td.textContent = outagesOverruled[types[r]].down;
        tr.append(td);

        td = document.createElement("td");
        td.setAttribute("style", "text-align: right");
        td.textContent = outagesOverruled[types[r]].up;
        tr.append(td);

        td = document.createElement("td");
        td.setAttribute("style", "text-align: right");
        td.textContent = outagesOverruled[types[r]].either;
        tr.append(td);

        td = document.createElement("td");
        td.setAttribute("style", "text-align: right");
        td.textContent = outagesOverruled[types[r]].not;
        tr.append(td);
    }

    document.body.append(table);
}

function loadList() {
    if (this.status == 200) {
        console.log("Received list "+this.responseText.length+" bytes");
        var jsondata = JSON.parse(this.responseText);

        jsondata.data_files.sort();

        document.getElementById("datafilePlaceholder").remove();
        var select = document.getElementById("datafile");

        // add in reverse order, so newest is at the top
        for (var i = jsondata.data_files.length - 1; i >= 0; i--) {
            var option = document.createElement("option");
            option.setAttribute("value", jsondata.data_files[i]);
            option.textContent = jsondata.data_files[i];
            select.append(option);
        }

        select.addEventListener("change", function() {
            // pick up files in reverse order so that we download oldest first
            var filesToLoad = []
            for (var i = select.selectedOptions.length - 1; i >= 0; i--) {
                filesToLoad.push(select.selectedOptions[i].value);
            }

            clearData();
            lastUptime = null;
            lastFiledate = null;
            connectedSpans = null;
            spanHisto = null;
            betaReclassifedHisto = null;
            adjacencies = null;
            outagesOverruled = null;
            startdate = null;
            
            loadFiles(filesToLoad);
        });
    } else {
        document.getElementById("datafilePlaceholder").textContent =
            "Unable to load list ("+this.status+")";
        console.log("Received non-200 status: "+this.status);
    }
}

function loadFiles(filesToLoad) {
    var nextfile = filesToLoad.shift();
    if (nextfile) {
        var path = "/data/" + nextfile;

        var dataReq = new XMLHttpRequest();
        dataReq.addEventListener("load", function() {
            if (this.status == 200) {
                consumeFile(JSON.parse(this.responseText), nextfile);
            } else {
                console.log("Received non-200 status: "+this.status);
            }
            loadFiles(filesToLoad);
        });
        dataReq.open("GET", path);
        dataReq.send();
    } else {
        plot();
    }
}

var dataListReq = new XMLHttpRequest();
dataListReq.addEventListener("load", loadList);
dataListReq.open("GET", "/data");
dataListReq.send();
