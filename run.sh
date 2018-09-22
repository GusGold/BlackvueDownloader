#!/bin/csh

set blackvueIP = "192.168.2.199"
set projectDir = "/home/BlackvueDownloader/"
set finishedDownloadDir = "/mnt/BlackvueVODs/"
set tempDownloadDir = "/home/BlackvueDownloader/temp/"

cd $projectDir
set isOnline = `nc -z -w 3 $blackvueIP 80 >&/dev/null && echo "true" || echo "false"`
if ( $isOnline == "true" ) then
  echo "checked network"
  if (-e node.pid) then
    set lastPID = `head -n 1 node.pid`
    #set isRunning = `kill -0 $lastPID 2>&1 && echo "true" || echo "false"`
    #echo $isRunning
    if ( -d "/proc/${lastPID}" ) then
      echo "Instance still running at $lastPID"
      goto abort
    else
      echo "Starting new instance"
      goto start
    endif
  else
    echo "No pid found, starting new instace"
    goto start
  endif
else
  echo "Blackvue not found on network at $blackvueIP"
  goto abort
endif

start:
  if (-e node.pid) rm node.pid
  set tempDir = `ls -a ${tempDownloadDir} | wc | awk '{print $1}'`
  if ("${tempDir}" != 2) rm ${tempDownloadDir}*
  node index.js -i http://${blackvueIP} -d ${finishedDownloadDir} -t ${tempDownloadDir} & echo $! >> node.pid
  exit 1

abort:
  exit 1
