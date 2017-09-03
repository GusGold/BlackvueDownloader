const commandLineArgs = require('command-line-args')
var request = require('request');
var async_ = require('async');
var fs = require('fs');

const optionDefinitions = [
  { name: 'ipaddress', alias: 'i', defaultValue: 'http://192.168.1.104' },
  { name: 'destination', alias: 'd', defaultValue: "/mnt/BlackvueVODs/" },
  { name: 'tempdir', alias: 't', defaultValue: __dirname + "/temp/" },
  { name: 'excludegps', alias: 'g', type: Boolean},
  { name: 'excludeaccelerometer', alias: 'a', type: Boolean },
  { name: 'excluderearcam', alias: 'r', type: Boolean },
  { name: 'downloadthreads', alias: 'c', type: Number, defaultValue: 1 }
];

const options = commandLineArgs(optionDefinitions);

const VODTYPE = /([A-Z])[FR]\.mp4$/
const CAMVIEW = /([FR])\.mp4$/

var vodtypes = {
  'N': 'NORMAL',
  'P': 'PARK',
  'E': 'EVENT',
  'M': 'MANUAL'
};

var camviews = {
  'F': 'FRONT',
  'R': 'REAR'
};

var keyFromVal = function(obj, val){
  var keys = Object.keys(obj);
  for(var i = 0; i < keys.length; i++){
    if(obj[keys[i]] == val){
      return keys[i];
    }
  }
  return undefined;
}

request(options.ipaddress + "/blackvue_vod.cgi", function(err, resp, body){
  var recordings = body.split("\n").slice(1, -1);
  var segments = {}
  var segmentArr = [];

  for(var line = 0; line < recordings.length; line++){
    var path = recordings[line].split(",")[0].split(":")[1];
    var filename = path.split("/")[2];
    var segmentUid = filename.substr(0, 15);
    var segmentDate = new Date(
      segmentUid.substr(0, 4),
      segmentUid.substr(4, 2) - 1,
      segmentUid.substr(6, 2),
      segmentUid.substr(9, 2),
      segmentUid.substr(11, 2),
      segmentUid.substr(13, 2));
    var segmentTime = Math.floor(segmentDate.getTime() / 1000);

    if(segments[segmentTime]){
      segment = segments[segmentTime]
    } else {
      segment = {
        date: segmentDate,
        segmentUid: segmentUid,
        views: {
          FRONT: null,
          REAR: null
        },
        type: null
      };

      segmentArr.push(segmentTime)

      var vodtype = filename.match(VODTYPE);
      if(vodtype && vodtypes[vodtype[1]]){
        segment.type = vodtypes[vodtype[1]];
      } else {
        console.warn("Unable to determine vodtype on " + filename);
      }
    }

    var camview = filename.match(CAMVIEW);
    if(camview && camviews[camview[1]]){
      segment.views[camviews[camview[1]]] = true;
    } else {
      console.warn("Unable to determine camview on " + filename);
    }

    segments[segmentTime] = segment;
  }

  var lastTrigger = null;
  var toDownload = [];

  for(var i = 0; i < segmentArr.length; i++){
    var segment = segments[segmentArr[i]];
    if(segment.type == 'EVENT' || segment.type == 'MANUAL'){
      if(lastTrigger){
        if(toDownload.indexOf(segmentArr[i]) === -1){
          toDownload.push(segmentArr[i]);
        }
        lastTrigger = segment.date.getTime();
      } else {
        var startDate = segment.date.getTime() - (5*60*1000) //5mins
        for(var j = 0; i - j >= 0 && startDate < segments[segmentArr[i - j]].date.getTime(); j++){
          if(toDownload.indexOf(segmentArr[i - j]) === -1){
            toDownload.push(segmentArr[i - j]);
          }
        }
      }
      lastTrigger = segment.date.getTime();
    } else {
      if(lastTrigger){
        if(lastTrigger + (5*60*1000) < segment.date.getTime()){
          lastTrigger = null;
        } else {
          if(toDownload.indexOf(segmentArr[i]) === -1){
            toDownload.push(segmentArr[i]);
          }
        }
      }
    }
  }

  var q = async_.queue(function(task, callback){
    console.log("Processing " + task.url)
    var fileStream = fs.createWriteStream(task.temp);
    fileStream.on('close', function(){
      console.log("chmod " + task.temp)
      fs.chmod(task.temp, 777, function(){
        console.log("chmod 777 " + task.temp);
        fs.readFile(task.temp, function(err, data){
          if(err){ console.log(err) } else {
            console.log("Read " + task.temp);
            fs.writeFile(task.file, data, function(err) {
              if(err){ console.log(err) } else {
                console.log("Wrote " + task.file);
                fs.unlink(task.temp, function(err) {
                  if(err){ console.log(err) } else {
                    console.log("Deleted " + task.temp);
                  }
                });
              }
            });
          }
        });
      });
      callback(null, "");
    });
    request(task.url).pipe(fileStream);
  }, options.downloadthreads);

  var filename = null

  for(var i = 0; i < toDownload.length; i++){
    // console.log(segments[toDownload[i]]);
    var segment = segments[toDownload[i]];
    filename = segment.segmentUid + "_" + keyFromVal(vodtypes, segment.type) + keyFromVal(camviews, "FRONT") + ".mp4";
    if(segment.views.FRONT && !fs.existsSync( options.destination + filename)){
      q.push({
        url: options.ipaddress + "/Record/" + filename,
        file: options.destination + filename,
        temp: options.tempdir + filename
      }, function(err, res){
        console.log("finished")
      });
    }
    var filename = segment.segmentUid + "_" + keyFromVal(vodtypes, segment.type) + keyFromVal(camviews, "REAR") + ".mp4";
    if(!options.excluderearcam && segment.views.REAR && !fs.existsSync( options.destination + filename)){
      q.push({
        url: options.ipaddress + "/Record/" + filename,
        file: options.destination + filename,
        temp: options.tempdir + filename
      }, function(err, res){
        console.log("finished")
      });
    }
    var filename = segment.segmentUid + "_" + keyFromVal(vodtypes, segment.type) + ".gps";
    if(!options.excludegps && !fs.existsSync( options.destination + filename)){
      q.push({
        url: options.ipaddress + "/Record/" + filename,
        file: options.destination + filename,
        temp: options.tempdir + filename
      }, function(err, res){
        console.log("finished")
      });
    }
    var filename = segment.segmentUid + "_" + keyFromVal(vodtypes, segment.type) + ".3gf";
    if(!options.excludeaccelerometer && !fs.existsSync( options.destination + filename)){
      q.push({
        url: options.ipaddress + "/Record/" + filename,
        file: options.destination + filename,
        temp: options.tempdir + filename
      }, function(err, res){
        console.log("finished")
      });
    }
  }
});