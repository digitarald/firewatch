# Firewatch

Real-time command-line memory monitor for Firefox OS devices. Polls [`b2g-info`](https://github.com/mozilla-b2g/gonk-misc/tree/master/b2g-info) via `adb shell`.

## Dependencies

 * `node` and `npm`
 * `adb` in `$path`
 * A Firefox OS device with 1.1+

## Installation

```
npm install -g firewatch
```

## Usage

```
firewatch
```

### Output

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
 * `node index.js`

## Roadmap

1. App memory history
  1. Keep killed apps
  2. Show min/max and avg/mean for `USS`/`PSS`
2. GUI & graphs
3. about:memory details