/* Copyright 2013 Chris Wilson, 2017 xupingmao

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    inputPoint = null,
    audioRecorder = null;
var rafID = null;
var analyserContext = null;
var diffAnalyserContext = null;
var canvasWidth, canvasHeight;
var recIndex = 0;

var lastFreqByteData = null;

// 绘图参数
// var SPACING = 3;
var SPACING = 10;
var BAR_WIDTH = 2;
var DIFF_THRESHOLD = 5;


/* TODO:

- offer mono option
- "Monitor input" switch
*/

function saveAudio() {
    audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    // audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    var canvas = document.getElementById( "wavedisplay" );

    drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

    // the ONLY time gotBuffers is called is right after a new recording is completed - 
    // so here's where we should set up the download.
    audioRecorder.exportWAV( doneEncoding );
}

function doneEncoding( blob ) {
    Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav" );
    recIndex++;
}

function toggleRecording( e ) {
    if (e.classList.contains("recording")) {
        // stop recording
        audioRecorder.stop();
        e.classList.remove("recording");
        audioRecorder.getBuffers( gotBuffers );
    } else {
        // start recording
        if (!audioRecorder)
            return;
        e.classList.add("recording");
        audioRecorder.clear();
        audioRecorder.record();
    }
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers(time) {
    if (!analyserContext) {
        var canvas = document.getElementById("analyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analyserContext = canvas.getContext('2d');
    }

    updateDiffAnalysers(time); // analyze diff.
    // analyzer draw code here
    {
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);
        // console.log("frequencyBinCount="+analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData); 
        
        // lastFreqByteData = [];
        updateCanvas(analyserContext, freqByteData);
        // console.log(lastFreqByteData);
    }

    window.freqByteData = freqByteData;    
    // X轴是频率
    // Y轴是振幅（强度）
    // rafID = window.requestAnimationFrame( updateAnalysers );
    setTimeout(updateAnalysers, 100);
}


function updateCanvas(analyserContext, freqByteData) {
    lastFreqByteData = [];
    var numBars = Math.round(canvasWidth / SPACING);
    analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
    analyserContext.fillStyle = '#F6D565';
    analyserContext.lineCap = 'round';
    var multiplier = analyserNode.frequencyBinCount / numBars;
    
    // Draw rectangle for each frequency bin.
    for (var i = 0; i < numBars; ++i) {
        var magnitude = 0;
        var offset = Math.floor( i * multiplier );
        // 求平均值
        // gotta sum/average the block, or we miss narrow-bandwidth spikes
        for (var j = 0; j< multiplier; j++) {
            magnitude += freqByteData[offset + j];
        }
        magnitude = magnitude / multiplier;
        lastFreqByteData[i] = magnitude; // record last freqByteData to compute diff.
        analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
        analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        if (i % 10 == 0) {            
            analyserContext.font="20px Georgia";
            analyserContext.fillText(parseInt(magnitude), i*SPACING, 20);
        }
    }
}

/**
 *  频率的差值
 */ 
function updateDiffAnalysers(time) {
    if (!diffAnalyserContext) {
        var canvas = document.getElementById("diffAnalyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        diffAnalyserContext = canvas.getContext('2d');
    }
    
    if (lastFreqByteData == null || lastFreqByteData.length == 0) return;

    // analyzer draw code here
    {
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);
        var activeCount = 0;

        analyserNode.getByteFrequencyData(freqByteData); 

        // for (var i = 0; i < lastFreqByteData.length; i++) {
        //     freqByteData[i] -= lastFreqByteData[i];
        // }

        // updateCanvas(diffAnalyserContext, freqByteData);
        // return;

        diffAnalyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        diffAnalyserContext.fillStyle = '#F6D565';
        diffAnalyserContext.lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;
        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++) {
                magnitude += freqByteData[offset + j];
            }
            magnitude = magnitude / multiplier;
            // 放大3倍
            magnitude = (magnitude - lastFreqByteData[i]);

            if (Math.abs(magnitude) > DIFF_THRESHOLD) {
                diffAnalyserContext.font="20px Georgia";
                diffAnalyserContext.fillText(parseInt(magnitude), i*SPACING, 20);
                activeCount++;
            } 

            // 调整高度，差值可能为负
            magnitude += 100;
            // magnitude += 100;
            diffAnalyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            diffAnalyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
        // console.log(magnitudeList);

        var element = document.getElementById("activeCount");
        if (element) {
            element.innerHTML = activeCount;
        }
    }
    
}

/**
 * 波形图, 波形图是记录声波强度和时间的关系
 * 频率是声波强度变化的快慢
 */
function updateAudioProcess (e) {
    // console.log(e);
    var canvas = document.getElementById("audioProcess");
    var height = 500;
    var width = 1024;
    var g = canvas.getContext("2d");

    //获取输入和输出的数据缓冲区
    var input=e.inputBuffer.getChannelData(0);
    var output=e.outputBuffer.getChannelData(0);
    //将输入数缓冲复制到输出缓冲上
    // for(var i=0;i<input.length;i++)
    //     output[i]=input[i];
    //将缓冲区的数据绘制到Canvas上
    g.clearRect(0, 0, width, height);
        
    g.strokeStyle = '#FF0000';
    g.beginPath();
    for(var i=0;i<width;i++) {
        var offset = (input.length * i / width) | 0;
        g.lineTo(i, height/2 * input[offset] + height / 2);
    }
    g.stroke();
};


function toggleMono() {
    if (audioInput != realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    audioInput.connect(inputPoint);
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    var processor = audioContext.createScriptProcessor(4096, 1, 1);


    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    // audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;

    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );

    inputPoint.connect( processor );
    processor.connect(audioContext.destination);

    // 更新分析器
    updateAnalysers();

    processor.onaudioprocess = updateAudioProcess;
}

function drawBuffer( width, height, context, data ) {
    var step = Math.ceil( data.length / width );
    var amp = height / 2;
    context.fillStyle = "silver";
    context.clearRect(0,0,width,height);
    for(var i=0; i < width; i++){
        var min = 1.0;
        var max = -1.0;
        for (j=0; j<step; j++) {
            var datum = data[(i*step)+j]; 
            if (datum < min)
                min = datum;
            if (datum > max)
                max = datum;
        }
        context.fillRect(i,(1+min)*amp,1,Math.max(1,(max-min)*amp));
    }
}


function initAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}

window.addEventListener('load', initAudio );
