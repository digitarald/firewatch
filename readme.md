# Firewatch

Real-time command-line memory monitor for Firefox OS devices. Polls [`b2g-info`](https://github.com/mozilla-b2g/gonk-misc/tree/master/b2g-info) via `adb shell`.

## Dependencies

 * `node` and `npm`
 * `adb` in `$path`
 * A Firefox OS device with 1.1+
 * `python` for memory reports

## Installation

```
npm install -g firewatch
```

## Usage

### Web UI

```
firewatch-server
```

```
Options:
   -p, --port          Port to use  [8080]
   -a, --address       Address to use  [0.0.0.0]
   -o, --open          Open browser after starting the server  [false]
   -v, --verbose       Verbose logging  [false]
   -a, --adb-path      ADB executable [adb in $PATH]
   -b, --b2g-path      B2G checkout (https://github.com/mozilla-b2g/B2G/)  […]
   -p, --output-path   Directory for dumping logs, profiles, memory reports, etc. [tmp folder]
   -d, --develop       For developing on Firewatch  [false]
```

![Screenshot](https://i.cloudup.com/gFBKQ-gXuL.png)

### Command-line output

```
firewatch
```

The numbers are in `megabyte` and update real-time; as fast as `b2g-info` can provide numbers (lag displayed in ms).

```
device:     b4ab7088f488 (130 ms)
free (mb):  152.1
cache (mb): 80.5
pid    app             uss      pss (mb)
130    b2g             51.6     55.0
326    Usage           11.5     13.9
371    Homescreen      14.2     16.9
426    Settings        15.3     18.7
2062   Facebook        14.4     17.6
```

`USS`/`PSS` memory usage explained by [eLinux.org](http://elinux.org/Android_Memory_Usage):

**USS** *(unique set size)* is the set of pages that are unique to a process. This is the amount of memory that would be freed if the application was terminated right now.

**PSS** *(proportional set size)* is the amount of memory shared with other processes, accounted in a way that the amount is divided evenly between the processes that share it. This is memory that would not be released if the process was terminated, but is indicative of the amount that this process is "contributing" to the overall memory load.

Further reading: [emilics.com](http://emilics.com/blog/article/mconsumption.html).

## Local Setup

 * Checkout project
 * `npm install`
 * `node lib/index.js`
 * or server `node lib/server.js`

## Roadmap

- [ ] Import dump from folder
- [x] App memory history
  - [x] Keep killed apps
  - [x] Show min/max and avg/mean for `USS`/`PSS`
- [x] GUI & graphs
- [x] about:memory details