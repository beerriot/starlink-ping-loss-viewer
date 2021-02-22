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
var stripeLengthV = constrainedValue(0, null, false);
stripeLengthV(600);

// Which sample to start the plot with. (init == 0)
var offsetV = constrainedValue(0, null, false);

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

// Largest data[i].n to render. (init == 0)
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

function dropType(sample) {
    return !sample.s ? "nosatellite" : (sample.o ? "obstructed" : "betadown")
}

function shouldShowDropAt(index, minLossRatio) {
    return display[dropType(data[index])] && (data[index].d >= minLossRatio);
}

function rescale() {
    var viewer = document.getElementById("viewer");
    viewer.setAttribute("width", boxWidthV()*stripeLengthV());
    viewer.setAttribute("height", boxHeightV()*Math.ceil(data.length/stripeLengthV()));
    var spanGroup = viewer.getElementById("spans");
    spanGroup.setAttribute("transform", "scale("+boxWidthV()+","+boxHeightV()+")");
}

function plot() {
    analyzeData()
    plotTimeseriesData()
    plotHistogramData()
}

function analyzeData() {
    if (connectedSpans != null && spanHisto != null) {
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
            connected: [0,0]
        };
    }

    // Memoization so we don't have to keep calling these in the loop.
    var connectedMinSec = connectedMinSecV();
    var connectedMaxDSec = connectedMaxDSecV();
    var minLossRatio = minLossRatioV();

    // Number of consecutive non-outage seconds up to i
    var connectedLength = 0;

    // Number of consecutive outage seconds (any type) up to i
    var totalDLength = 0;

    // Number of consecutive outage seconds of the same type up to i
    var dLength = 0;

    // Type of the outage at i (but mostly referenced before update, so i-1)
    var dType = null;

    for (var i = 0; i < data.length; i++) {
        if (!shouldShowDropAt(i, minLossRatio)) {
            if (dLength > 0) {
                addToHisto(dType, dLength);
                dType = null;
                dLength = 0;
            }
            totalDLength = 0;
            connectedLength += 1;
        } else {
            totalDLength += 1;
            if (totalDLength > connectedMaxDSec) {
                if (connectedLength > 0) {
                    addToHisto("connected", connectedLength);
                }
                if (connectedLength >= connectedMinSec) {
                    connectedSpans.push({"start":i-connectedLength, "end":i});
                }
                connectedLength = 0;
            } else {
                connectedLength += 1;
            }

            var newDType = dropType(data[i]);
            if (dType == null) {
                dType = newDType;
            } else if (dType != newDType) {
                addToHisto(dType, dLength);
                dType = newDType;
                dLength = 0;
            }
            dLength += 1;
        }
    }

    if (connectedLength > 0) {
        addToHisto("connected", connectedLength);
        if (connectedLength >= connectedMinSec) {
            connectedSpans.push({"start":data.length-connectedLength,
                                 "end":data.length});
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
    // functions data.length times.
    var stripeLength = stripeLengthV();
    var offset = offsetV();
    var minLossRatio = minLossRatioV();
    var maxSnr = maxSnrV();

    viewer = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    viewer.setAttribute("id", "viewer")
    var width = stripeLength * boxWidthV();
    viewer.setAttribute("width", width)
    var height = Math.ceil(data.length / stripeLength) * boxHeightV()
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

    for (var i = offset; i < data.length; i++) {
        var oi = i-offset;
        if (display["snr"] && data[i].n <= maxSnr) {
            if (data[i].n != snrLevel) {
                // snr span ended in a different snr level
                if (snrLevel != null) {
                    appendSpans(makeSpans(stripeLength,
                                          oi-snrLength, oi,
                                          colors.snr, 1-(snrLevel/9)));
                }
                snrLevel = data[i].n;
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

        if (shouldShowDropAt(i, minLossRatio)) {
            var newDType = dropType(data[i]);
            if (newDType != dType || data[i].d != dLevel) {
                // drop span ended in a new drop span
                if (dType != null) {
                    appendSpans(makeSpans(stripeLength,
                                          oi-dLength, oi,
                                          colors[dType], dLevel));
                }
                dType = newDType;
                dLevel = data[i].d;
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
                              data.length-offset-snrLength, data.length-offset,
                              colors.snr, 1-(snrLevel/9)));
    }

    if (dType != null) {
        // graph ended with an outage
        appendSpans(makeSpans(stripeLength,
                              data.length-offset-dLength, data.length-offset,
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

    // 12 because there are 4 categories, and 12 is evenly divisible
    // by any selection of that.
    var bucketWidth = 12;
    var graphWidth = bucketWidth * spanHisto.length;
    var barWidth = bucketWidth/plotCount;
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

    var addBar = function(index, value, color) {
        var x = index * barWidth;
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
        var basey = topInset + graphHeight;
        var arrowHeight = bucketWidth / 2
        gridArrow.setAttribute("points",
                               basex+","+basey+" "+
                               (basex+bucketWidth)+","+basey+" "+
                               (basex+bucketWidth/2)+","+(basey+arrowHeight));
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
            if (display[k]) {
                addBar((i * plotCount) + barCount, spanHisto[i][k][0], colors[k]);
                barCount += 1;
            }
        }
    }
    histo.append(graph);
    document.body.append(histo)
}

var dataReq = new XMLHttpRequest();
dataReq.addEventListener("load", loadData);
dataReq.open("GET", "viewer-data.json");
dataReq.send();
