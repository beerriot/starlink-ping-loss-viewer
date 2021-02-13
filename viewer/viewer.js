var data=[]
var stripeLength=900
var offset=0
var boxWidth=3
var boxHeight=3
var display = {
    "obstructed": true,
    "betadown": false,
    "nosatellite": false,
    "snr": false,
};

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
    
    viewer = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    viewer.setAttribute("id", "viewer")
    var width = stripeLength * boxWidth;
    viewer.setAttribute("width", width)
    var height = Math.ceil(data.length / stripeLength) * boxHeight
    viewer.setAttribute("height", height)

    for (var i = offset; i < data.length; i++) {
        var boxX = ((i-offset) % stripeLength) * boxWidth
        var boxY = Math.floor((i-offset) / stripeLength) * boxHeight
        if (display["snr"] && data[i].n < 9) {
            viewer.append(makeBox(boxX, boxY, "#999999", 1-(data[i].n/9)));
        }
        if (((display["obstructed"] && data[i].o) ||
             (display["nosatellite"] && !data[i].s) ||
             (display["betadown"] && data[i].s && !data[i].o)) &&
             data[i].d < 1) {

            var red = (data[i].o && display["obstructed"]) ? "ff" : "00"
            var green = (!data[i].s && display["nosatellite"]) ? "ff" : "00"
            var blue = (!data[i].o && data[i].s && display["betadown"]) ? "ff" : "00"
            color = "#"+red+green+blue
            if (color == "#ffffff") {
                color = "#000000"
            }
            
            var opacity = data[i].d
            viewer.append(makeBox(boxX, boxY, color, opacity))
        }
    }

    document.body.append(viewer)
}

function loadData() {
    if (this.status == 200) {
        console.log("Received data "+this.responseText.length+" bytes");
        var jsondata = JSON.parse(this.responseText);
        data = jsondata.data;
        plot();
    } else {
        console.log("Received non-200 status: "+this.status);
    }
}

var dataReq = new XMLHttpRequest();
dataReq.addEventListener("load", loadData);
dataReq.open("GET", "viewer-data.json");
dataReq.send();
