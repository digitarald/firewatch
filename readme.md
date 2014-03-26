# Firewatch

Real-time command-line memory monitor for Firefox OS devices. Uses [`b2g-info`](https://github.com/mozilla-b2g/gonk-misc/tree/master/b2g-info).

## Setup

 * Checkout project
 * `npm install`

## Usage

```
node index.js
```

## Example output

The numbers are in `megabyte` and update real-time; as fast as `b2g-info` can provide numbers (lag displayed in ms).

```
full_unagi (129 ms)
free (mb):           23.1
cache (mb):          54.0
pid    app             uss      pss      vsize (mb)
23071  b2g             53.2     55.8     173.7
23134  Usage           10.1     12.4     62.7
23165  Homescreen      11.5     14.1     67.2
23219  Calculator      8.3      10.5     61.1
```

**USS** *(unique set size)* is the set of pages that are unique to a process. This is the amount of memory that would be freed if the application was terminated right now.

**PSS** *(proportional set size)* is the amount of memory shared with other processes, accounted in a way that the amount is divided evenly between the processes that share it. This is memory that would not be released if the process was terminated, but is indicative of the amount that this process is "contributing" to the overall memory load.

http://elinux.org/Android_Memory_Usage

## Dependencies

 * `node` and `npm`
 * `ADB` in `$path`
 * A Firefox OS device with 1.1+

## Roadmap

1. App memory history
  1. Keep killed apps
  2. Show min/max and avg/mean for `USS`/`PSS`
2. GUI & graphs
3. about:memory details