const commandLineArgs = require('command-line-args')
var request = require('request')
var async_ = require('async')
var fs = require('fs')
const fse = require('fs-extra')
const path = require('path')

const optionDefinitions = [
  {name: 'ipaddress', alias: 'i', defaultValue: 'http://192.168.2.199'},
  {name: 'destination', alias: 'd', defaultValue: '/mnt/BlackvueVODs/'},
  {name: 'tempdir', alias: 't', defaultValue: path.join(__dirname, '/temp/')},
  {name: 'excludegps', alias: 'g', type: Boolean},
  {name: 'excludeaccelerometer', alias: 'a', type: Boolean},
  {name: 'excluderearcam', alias: 'r', type: Boolean},
  {name: 'downloadthreads', alias: 'c', type: Number, defaultValue: 1}
]

const options = commandLineArgs(optionDefinitions)

const VODTYPE = /([A-Z])[FR]\.mp4$/
const CAMVIEW = /([FR])\.mp4$/

var vodtypes = {
  'N': 'NORMAL',
  'P': 'PARK',
  'E': 'EVENT',
  'M': 'MANUAL'
}

var camviews = {
  'F': 'FRONT',
  'R': 'REAR'
}

var keyFromVal = function (obj, val) {
  var keys = Object.keys(obj)
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] === val) {
      return keys[i]
    }
  }
  return undefined
}

request(options.ipaddress + '/blackvue_vod.cgi', function (err, resp, body) {
  if (err) { console.log(err) };
  if (!body) { console.log('body undefined'); process.exit() }
  var recordings = body.split('\n').slice(1, -1)
  var segments = {}
  var segmentArr = []

  for (var line = 0; line < recordings.length; line++) {
    var filepath = recordings[line].split(',')[0].split(':')[1]
    var filename = filepath.split('/')[2]
    var segmentUid = filename.substr(0, 15)
    var segmentDate = new Date(
      segmentUid.substr(0, 4),
      segmentUid.substr(4, 2) - 1,
      segmentUid.substr(6, 2),
      segmentUid.substr(9, 2),
      segmentUid.substr(11, 2),
      segmentUid.substr(13, 2))
    var segmentTime = Math.floor(segmentDate.getTime() / 1000)

    let segment

    if (segments[segmentTime]) {
      segment = segments[segmentTime]
    } else {
      segment = {
        date: segmentDate,
        segmentUid: segmentUid,
        views: {
          FRONT: null,
          REAR: null
        },
        type: null,
        folder: ''
      }

      segmentArr.push(segmentTime)

      var vodtype = filename.match(VODTYPE)
      if (vodtype && vodtypes[vodtype[1]]) {
        segment.type = vodtypes[vodtype[1]]
      } else {
        console.warn('Unable to determine vodtype on ' + filename)
      }
    }

    var camview = filename.match(CAMVIEW)
    if (camview && camviews[camview[1]]) {
      segment.views[camviews[camview[1]]] = true
    } else {
      console.warn('Unable to determine camview on ' + filename)
    }

    segments[segmentTime] = segment
  }

  segmentArr.sort(function (a, b) {
    return (a > b ? 1 : (a < b ? -1 : 0))
  })

  var lastTrigger = null
  var toDownload = []
  var lastSegment = null
  for (var i = 0; i < segmentArr.length; i++) {
    var segment = segments[segmentArr[i]]
    if (segment.type === 'EVENT' || segment.type === 'MANUAL') {
      if (segment.type === 'EVENT' && segments[segmentArr[i - 1]] && segments[segmentArr[i - 1]].type === 'PARK' && segments[segmentArr[i + 1]] && segments[segmentArr[i + 1]].type === 'NORMAL') {
        // event was triggered from me starting car and driving off, so no need to worry
        console.log('Ignoring ' + segment.date + ' because it was a PARK->EVENT->NORMAL event')
      } else {
        if (lastTrigger) {
          if (toDownload.indexOf(segmentArr[i]) === -1) {
            toDownload.push(segmentArr[i])
          }
          lastTrigger = segment.date.getTime()
          lastSegment = segment
          segments[segmentArr[i]].folder = lastSegment.segmentUid + ' ' + lastSegment.type
        } else {
          lastSegment = segment
          var startDate = segment.date.getTime() - (5 * 60 * 1000) // 5mins
          for (var j = 0; i - j >= 0 && segments[segmentArr[i - j]].date.getTime() > startDate; j++) {
            if (toDownload.indexOf(segmentArr[i - j]) === -1) {
              console.log('Adding ' + segments[segmentArr[i - j]].date + ' because it was within the 5 mins prior to ' + segment.date)
              segments[segmentArr[i - j]].folder = lastSegment.segmentUid + ' ' + lastSegment.type
              toDownload.push(segmentArr[i - j])
            }
          }
        }
        lastTrigger = segment.date.getTime()
      }
    } else {
      if (lastTrigger) {
        if (lastTrigger + (5 * 60 * 1000) < segment.date.getTime()) {
          lastTrigger = null
        } else {
          if (toDownload.indexOf(segmentArr[i]) === -1) {
            console.log('Adding ' + segments[segmentArr[i]].date + ' because it was within the 5 mins after ' + segment.date)
            segments[segmentArr[i]].folder = lastSegment.segmentUid + ' ' + lastSegment.type
            toDownload.push(segmentArr[i])
          }
        }
      }
    }
  }

  var q = async_.queue(function (task, callback) {
    console.log('Processing ' + task.url)
    var fileStream = fs.createWriteStream(task.temp)
    fileStream.on('close', function () {
      console.log('chmod ' + task.temp)
      fs.chmod(task.temp, 777, function (err) {
        if (err) { console.log(err) } else {
          console.log('chmod 777 ' + task.temp)
          fs.readFile(task.temp, function (err, data) {
            if (err) { console.log(err) } else {
              console.log('Read ' + task.temp)
              fse.outputFile(task.file, data, function (err) {
                if (err) { console.log(err) } else {
                  console.log('Wrote ' + task.file)
                  fs.unlink(task.temp, function (err) {
                    if (err) { console.log(err) } else {
                      console.log('Deleted ' + task.temp)
                    }
                  })
                }
              })
            }
          })
        }
      })
      callback(null, '')
    })
    console.log('getting ' + task.url)
    request(task.url).pipe(fileStream)
  }, options.downloadthreads)

  filename = null

  if (!toDownload.length) {
    console.log('No new files to download')
  }

  for (i = 0; i < toDownload.length; i++) {
    segment = segments[toDownload[i]]
    filename = segment.segmentUid + '_' + keyFromVal(vodtypes, segment.type) + keyFromVal(camviews, 'FRONT') + '.mp4'
    if (segment.views.FRONT && !fs.existsSync(path.join(options.destination, segment.folder, filename))) {
      q.push({
        url: options.ipaddress + '/Record/' + filename,
        file: path.join(options.destination, segment.folder, filename),
        temp: path.join(options.tempdir, filename)
      }, function (err, res) {
        if (err) console.error(err)
        console.log('finished')
      })
    }
    filename = segment.segmentUid + '_' + keyFromVal(vodtypes, segment.type) + keyFromVal(camviews, 'REAR') + '.mp4'
    if (!options.excluderearcam && segment.views.REAR && !fs.existsSync(path.join(options.destination, segment.folder, filename))) {
      q.push({
        url: options.ipaddress + '/Record/' + filename,
        file: path.join(options.destination, segment.folder, filename),
        temp: path.join(options.tempdir, filename)
      }, function (err, res) {
        if (err) console.error(err)
        console.log('finished')
      })
    }
    filename = segment.segmentUid + '_' + keyFromVal(vodtypes, segment.type) + '.gps'
    if (!options.excludegps && !fs.existsSync(path.join(options.destination, segment.folder, filename))) {
      q.push({
        url: options.ipaddress + '/Record/' + filename,
        file: path.join(options.destination, segment.folder, filename),
        temp: path.join(options.tempdir, filename)
      }, function (err, res) {
        if (err) console.error(err)
        console.log('finished')
      })
    }
    filename = segment.segmentUid + '_' + keyFromVal(vodtypes, segment.type) + '.3gf'
    if (!options.excludeaccelerometer && !fs.existsSync(path.join(options.destination, segment.folder, filename))) {
      q.push({
        url: options.ipaddress + '/Record/' + filename,
        file: path.join(options.destination, segment.folder, filename),
        temp: path.join(options.tempdir, filename)
      }, function (err, res) {
        if (err) console.error(err)
        console.log('finished')
      })
    }
  }
})
