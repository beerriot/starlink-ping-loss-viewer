var data=[]
var startdate=null
var stripeLength=600
var offset=0
var boxWidth=3
var boxHeight=3
var display = {
    "obstructed": true,
    "betadown": false,
    "nosatellite": false,
    "snr": false,
    "strict": false,
    "connected": false
};
var connectedParams = {
    "minSec": 1800,
    "maxD": 1,
    "maxDSec": 2,
};
var connectedSpans = null;

var lengthBox = document.getElementById("stripeLength")
var offsetBox = document.getElementById("offset")
var boxWidthBox = document.getElementById("boxWidth")
var boxHeightBox = document.getElementById("boxHeight")

function lengthButtonClick(value) {
    stripeLength = Math.max(1, stripeLength+value)
    lengthBox.value = stripeLength
    plot()
}

function offsetButtonClick(value) {
    offset = Math.max(0, offset+value)
    offsetBox.value = offset
    plot()
}

function boxWidthButtonClick(value) {
    boxWidth = Math.max(1, boxWidth+value)
    boxWidthBox.value = boxWidth
    plot()
}

function boxHeightButtonClick(value) {
    boxHeight = Math.max(1, boxHeight+value)
    boxHeightBox.value = boxHeight
    plot()
}

function inputChangeThunk(input, setter) {
    return function() {
        var newVal = parseInt(input.value)
        if (!isNaN(newVal)) {
            setter(newVal)
            plot()
        }
    }
}
function attachInput(input, setter) {
    input.value = setter()
    input.addEventListener("change", inputChangeThunk(input, setter))
}

attachInput(lengthBox, function(newVal) {
    if (newVal != null) {
        stripeLength = Math.max(1, newVal)
    }
    return stripeLength
});

attachInput(offsetBox, function(newVal) {
    if (newVal != null) {
        offset = Math.max(0, newVal)
    }
    return offset
});

attachInput(boxWidthBox, function(newVal) {
    if (newVal != null) {
        boxWidth = Math.max(1, newVal)
    }
    return boxWidth
});

attachInput(boxHeightBox, function(newVal) {
    if (newVal != null) {
        boxHeight = Math.max(1, newVal)
    }
    return boxHeight
});

attachInput(document.getElementById("connectedMinSpan"), function(newVal) {
    if (newVal != null) {
        connectedParams.minSec = newVal;
        connectedSpans = null;
    }
    return connectedParams.minSec;
});
attachInput(document.getElementById("connectedMaxD"), function(newVal) {
    if (newVal != null) {
        connectedParams.maxD = newVal;
        connectedSpans = null;
    }
    return connectedParams.maxD;
});
attachInput(document.getElementById("connectedMaxDSpan"), function(newVal) {
    if (newVal != null) {
        connectedParams.maxDSec = newVal;
        connectedSpans = null;
    }
    return connectedParams.maxDSec;
});

function attachCheckbox(name) {
    var checkbox = document.getElementById(name);
    if (display[name]) {
        checkbox.setAttribute("checked", true)
    }
    checkbox.addEventListener("change", function() {
        display[name] = checkbox.checked
        plot()
    })
}
attachCheckbox("obstructed");
attachCheckbox("betadown");
attachCheckbox("nosatellite");
attachCheckbox("snr");
attachCheckbox("strict");
attachCheckbox("connected");

function attachButtons(prefix, actionFunc) {
    var buttons = {
        "minus30": -30,
        "minus10": -10,
        "minus1": -1,
        "plus1": 1,
        "plus10": 10,
        "plus30": 30
    };
    var thunker = function(value) { return function() { actionFunc(value) } };
    for (var key in buttons) {
        var b = document.getElementById(prefix+key);
        if (b) {
            b.addEventListener("click", thunker(buttons[key]));
        }
    }
}

attachButtons("stripeLength_", lengthButtonClick);
attachButtons("offset_", offsetButtonClick);
attachButtons("boxWidth_", boxWidthButtonClick);
attachButtons("boxHeight_", boxHeightButtonClick);

function makeBox(x, y, color, opacity) {
    var box = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    box.setAttribute("x", x)
    box.setAttribute("y", y)
    box.setAttribute("width", boxWidth)
    box.setAttribute("height", boxHeight)
    box.setAttribute("fill", color)
    box.setAttribute("fill-opacity", opacity)
    return box
}

function plot() {
    var viewer = document.getElementById("viewer")
    if (viewer) {
        viewer.remove();
    }

    if (display["connected"] && connectedSpans == null) {
        connectedSpans = [];

        var runLength = 0;
        var dLength = 0;
        for (var i = 0; i < data.length; i++) {
            if (data[i].d < connectedParams.maxD) {
                dLength = 0;
                runLength += 1;
            } else {
                dLength += 1;
                if (dLength > connectedParams.maxDSec) {
                    if (runLength >= connectedParams.minSec) {
                        connectedSpans.push({"start":i-runLength, "end":i});
                    }
                    runLength = 0;
                } else {
                    runLength += 1;
                }
            }
        }
        if (runLength >= connectedParams.minSec) {
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
        if (display["snr"] &&
            ((!display["strict"] && data[i].n < 9) ||
             (display["strict"] && data[i].n == 0))) {
            viewer.append(makeBox(boxX, boxY, "#999999", 1-(data[i].n/9)));
        }
        if (display["connected"]) {
            for (var j = 0; j < connectedSpans.length; j++) {
                if (i >= connectedSpans[j].start && i < connectedSpans[j].end) {
                    viewer.append(makeBox(boxX, boxY, "#ffee00", 1));
                    break;
                }
            }
        }
        if (((display["obstructed"] && data[i].o) ||
             (display["nosatellite"] && !data[i].s) ||
             (display["betadown"] && data[i].s && !data[i].o)) &&
            ((!display["strict"] && data[i].d > 0) ||
             (display["strict"] && data[i].d == 1))) {

            var color = "#cc00ff"
            if (!data[i].s && display["nosatellite"]) {
                color = "#00ff00"
            } else if (!data[i].o && data[i].s && display["betadown"]) {
                // beta downtime
                color = "#0000ff"
            } else if (data[i].o && display["obstructed"]) {
                // obstruction
                color = "#ff0000"
            }
            
            var opacity = data[i].d
            viewer.append(makeBox(boxX, boxY, color, opacity))
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

var dataReq = new XMLHttpRequest();
dataReq.addEventListener("load", loadData);
dataReq.open("GET", "viewer-data.json");
dataReq.send();
