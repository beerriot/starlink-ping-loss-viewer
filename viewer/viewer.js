// Samples will be loaded here.
var data = []
// Datetime of earliest sample.
var startdate = null;
// Spans of uninterrupted connectivity. Computed by analyzing `data` at plot time.
var connectedSpans = null;
// Histogram of span lengths. Computed by analyzing `data` at plot time.
var spanHisto = null;

// Rendering parameters are functions with captured values. The
// function alters the captured value by the passed amount, and
// returns the result after constraining it to the minimum and maximum
// configured at creation. Call with no parameters to read the value
// without modification.
function constrainedValue(min, max, clearsConnectivity = true) {
    var currentValue =
        Math.min(max || Number.MAX_SAFE_INTEGER,
                 Math.max(min || 0, Number.MIN_SAFE_INTEGER))
    return function(change = 0) {
        if (change != 0 && clearsConnectivity) {
            connectedSpans = null;
            spanHisto = null;
        }

        currentValue += change
        if (min) {
            currentValue = Math.max(currentValue, min);
        }
        if (max) {
            currentValue = Math.min(currentValue, max);
        }
        return currentValue;
    }
};

// Samples per row.
var stripeLengthV = constrainedValue(0, null, false);
stripeLengthV(600);

// Which sample to start the plot with.
var offsetV = constrainedValue(0, null, false);
offsetV(0);

// Size of a rendered sample.
var boxWidthV = constrainedValue(1, null, false);
boxWidthV(1); // == 1 + 1 == 2
var boxHeightV = constrainedValue(1, null, false);
boxHeightV(1); // == 1 + 1 == 2

// Which items to display.
var display = {
    "obstructed": true,
    "betadown": false,
    "nosatellite": false,
    "snr": false,
    "connected": false
};

var colors = {
    obstructed: "#ff0000",
    betadown: "#0000ff",
    nosatellite: "#00ff00",
    snr: "#999999",
    connected: "#ffee00"
};

// Smallest data[i].d to render.
var minLossRatioV = constrainedValue(0, 1);
minLossRatioV(1);

// Largest data[i].n to render.
var maxSnrV = constrainedValue(0, 9);
maxSnrV(-9); // == 9 - 9 == 0

// What constitues a connected region.
var connectedMinSecV = constrainedValue(1);
connectedMinSecV(1799); // == 1 + 1799 == 1800
var connectedMaxDSecV = constrainedValue(0);
connectedMaxDSecV(2);

function attachButtons(prefix, value, textInput) {
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
            plot();
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

function attachInput(name, value, parser = parseInt) {
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
            plot();
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
              attachInput("boxWidth", boxWidthV));
attachButtons("boxHeight", boxHeightV,
              attachInput("boxHeight", boxHeightV));
attachInput("minLossRatio", minLossRatioV, parseFloat);
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

function shouldShowDropAt(index, minLossRatio) {
    return ((display["obstructed"] && data[index].o) ||
            (display["nosatellite"] && !data[index].s) ||
            (display["betadown"] && data[index].s && !data[index].o)) &&
        (data[index].d >= minLossRatio);
}

function plot() {
    plotTimeseriesData()
    plotHistogramData()
}

function plotTimeseriesData() {
    var viewer = document.getElementById("viewer")
    if (viewer) {
        viewer.remove();
    }

    // Memoize current values, so we don't have to call their
    // functions data.length times.
    var stripeLength = stripeLengthV();
    var offset = offsetV();
    var boxWidth = boxWidthV();
    var boxHeight = boxHeightV();
    var minLossRatio = minLossRatioV();
    var maxSnr = maxSnrV();

    if (display["connected"] && connectedSpans == null) {
        connectedSpans = [];

        // More memoization, but these should only be needed during
        // this recalculation.
        var connectedMinSec = connectedMinSecV();
        var connectedMaxDSec = connectedMaxDSecV();

        var runLength = 0;
        var dLength = 0;
        for (var i = 0; i < data.length; i++) {
            if (!shouldShowDropAt(i, minLossRatio)) {
                dLength = 0;
                runLength += 1;
            } else {
                dLength += 1;
                if (dLength > connectedMaxDSec) {
                    if (runLength >= connectedMinSec) {
                        connectedSpans.push({"start":i-runLength, "end":i});
                    }
                    runLength = 0;
                } else {
                    runLength += 1;
                }
            }
        }
        if (runLength >= connectedMinSec) {
            connectedSpans.push({"start":data.length-runLength, "end":data.length});
        }
    }
    
    viewer = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    viewer.setAttribute("id", "viewer")
    var width = stripeLength * boxWidth;
    viewer.setAttribute("width", width)
    var height = Math.ceil(data.length / stripeLength) * boxHeight
    viewer.setAttribute("height", height)

    for (var i = offset; i < data.length; i++) {
        var boxX = ((i-offset) % stripeLength) * boxWidth
        var boxY = Math.floor((i-offset) / stripeLength) * boxHeight
        if (display["snr"] && data[i].n <= maxSnr) {
            viewer.append(makeBox(boxWidth, boxHeight, boxX, boxY, colors.snr, 1-(data[i].n/9)));
        }
        if (display["connected"]) {
            for (var j = 0; j < connectedSpans.length; j++) {
                if (i >= connectedSpans[j].start && i < connectedSpans[j].end) {
                    viewer.append(makeBox(boxWidth, boxHeight, boxX, boxY, colors.connected, 1));
                    break;
                }
            }
        }
        if (shouldShowDropAt(i, minLossRatio)) {
            var opacity = data[i].d
            viewer.append(makeBox(boxWidth, boxHeight, boxX, boxY, colors[dropType(data[i])], opacity))
        }
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

        var index = Math.floor(svgy/boxHeight)*stripeLength + Math.floor(svgx/boxWidth)
        var hereDate = startdate ? new Date(startdate) : ""
        startdate && hereDate.setSeconds(hereDate.getSeconds() + index);
        time.innerHTML = index + " " + hereDate;
    });

}

function loadData() {
    if (this.status == 200) {
        console.log("Received data "+this.responseText.length+" bytes");
        var jsondata = JSON.parse(this.responseText);

        data = jsondata.data;

        var lastfilename = (jsondata.filenames.length > 1) && jsondata.filenames[jsondata.filenames.length-1]
        var dateparts = lastfilename.match(/(\d\d\d\d)-(\d\d)-(\d\d)-(\d\d)(\d\d)(\d\d).json/)
        startdate = dateparts.length == 7 && new Date(dateparts[1], parseInt(dateparts[2])-1, dateparts[3], dateparts[4], dateparts[5], dateparts[6])
        startdate.setSeconds(startdate.getSeconds() - data.length);

        plot();
    } else {
        console.log("Received non-200 status: "+this.status);
    }
}

function addToHisto(type, seconds) {
    var b = Math.min(spanHisto.length-1,
                     seconds < 60 ? seconds : 60 + Math.floor(seconds / 60));
    spanHisto[b][type][0] += 1;
    spanHisto[b][type][1] += seconds;
}

function dropType(sample) {
    return !sample.s ? "nosatellite" : (sample.o ? "obstructed" : "betadown")
}

function plotHistogramData() {
    if (spanHisto == null) {
        // 60 second buckets, and 60 minute buckets
        spanHisto = new Array(120);
        
        // important: names must match `display` object fields
        // [instance count, total seconds]
        for (var i = 0; i < spanHisto.length; i++) {
            spanHisto[i] = {obstructed: [0,0], betadown: [0,0], nosatellite: [0,0], connected: [0,0]};
        }

        var minLossRatio = minLossRatioV()
        
        var runLength = 0;
        var dLength = 0;
        var dType = null;
        for (var i = 0; i < data.length; i++) {
            if (!shouldShowDropAt(i, minLossRatio)) {
                if (dLength > 0) {
                    if (display[dType]) {
                        addToHisto(dType, dLength);
                    }
                    dType = null;
                    dLength = 0;
                }
                runLength += 1;
            } else {
                if (runLength > 0) {
                    if (display.connected) {
                        addToHisto("connected", runLength);
                    }
                    runLength = 0;
                }

                var newDType = dropType(data[i]);
                if (dType == null) {
                    dType = newDType;
                } else if (dType != newDType) {
                    if (display[dType]) {
                        addToHisto(dType, dLength);
                    }
                    dType = newDType;
                    dLength = 0;
                }
                dLength += 1;
            }
        }
        if (runLength > 0) {
            if (display.connected) {
                addToHisto("connected", runLength);
            }
        } else if (dLength > 0) {
            if (display[dType]) {
                addToHisto(dType, dLength);
            }
        }
    }

    var normal = 0;
    for (var i = 0; i < spanHisto.length; i++) {
        for (var k in spanHisto[i]) {
            normal = Math.max(normal, spanHisto[i][k][0]);
        }
    }

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
    var barWidth = 2;
    var svgWidth = spanHisto.length * barWidth * plotCount;
    var svgHeight = 200;
    histo.setAttribute("width", svgWidth);
    histo.setAttribute("height", svgHeight);

    var addBar = function(index, value, color) {
        var x = index * barWidth;
        var height = svgHeight * (value / normal);
        var y = svgHeight - height;

        var bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", x);
        bar.setAttribute("width", barWidth);
        bar.setAttribute("y", y);
        bar.setAttribute("height", height);
        bar.setAttribute("fill", color);
        histo.append(bar);
    }

    for (var i = 0; i < spanHisto.length; i++) {
        barCount = 0;
        for (var k in spanHisto[i]) {
            if (display[k]) {
                addBar((i * plotCount) + barCount, spanHisto[i][k][0], colors[k]);
                barCount += 1;
            }
        }
    }
    document.body.append(histo)
}

var dataReq = new XMLHttpRequest();
dataReq.addEventListener("load", loadData);
dataReq.open("GET", "viewer-data.json");
dataReq.send();
