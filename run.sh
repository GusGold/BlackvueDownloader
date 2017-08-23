start () {
  date +%s > script.lock
  node index.js
  rm script.lock
}

nc -z 192.168.1.104 80>>/dev/null #IP of Blackvue dashcam
if  [ $?  == 0 ]; then
  cd /home/BlackvueDownloader #path of repo
  if [ -e script.lock ]; then
    lockdate=$(head -n 1 script.lock)
    currentdate=$(date +%s)
    unlockdate=$((currentdate - 6*60))
    if [ $lockdate -lt $unlockdate ]; then
      start
    fi
  else
    start
  fi
fi
