# BlackvueDownloader
Download clips from Blackvue dashcam. This script is designed to run in a FreeNAS 11 Jail and called from the host machine's crontab.

## Installation

1. Download and extract [zip](//github.com/GusGold/BlackvueDownloader/archive/master.zip)
2. Edit run.sh to reflect the IP addressed assigned to your Blackvue dashcam on your network
3. Add any [arguments](#node-arguments) to the [`node index.js`](//github.com/GusGold/BlackvueDownloader/blob/master/run.sh#L3) command
4. Add a cronjob to FreeNAS using `jexec <jail id> </path/to/>run.sh`
5. ?????
6. Profit


## Node Arguments

Option | Alias | DefaultValue | Description
--: | :-: | :-: | ---
`ipaddress` | `i` | `http://192.168.1.104` | The ip address of your blackvue. I suggest you reserve an IP for your camera's MAC address if using DHCP
`destination` | `d` | `/mnt/BlackvueVODs/` | The destination path for completed downloads. Try using [Jail Storage](http://doc.freenas.org/11/jails.html#add-storage) to link to a separate dataset
`tempdir` | `t` | `__dirname + "/temp/"` | A cache path for in progress downloads. This ensures that partially downloaded files are not mistaken for being completed
`excludegps` | `g` | `false` | Prevents downloading of gps data
`excludeaccelerometer` | `a` | `false` | Prevents downloading of accelerometer data
`excluderearcam` | `r` | `false` | Prevents downloading of rear cam. Enable flag if you have a 1CH model to save resources
`downloadthreads` | `c` | `1` | Set the download thread concurrency. >1 Might be result in a net increase in transfer speed
