#!/bin/csh
set projectDir = "/home/BlackvueDownloader/"
cd $projectDir

if (-e node.pid) then
  set lastPID = `head -n 1 node.pid`
  kill $lastPID
endif
