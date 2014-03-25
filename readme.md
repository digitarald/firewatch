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

```
04e07f8758dd6913
free:                1460.8
cache:               146.4
pid  app             uss      pss
177  b2g             70.3     76.2
642  Homescreen      21.7     25.8
835  Sketchbook Squa 12.9     15.2
1104 Usage           14.1     16.4
6912 Settings        17.0     19.6
7054 Captain Rogers  38.1     45.5
```

## Dependencies

 * `node` and `npm`
 * `ADB` in `$path`
 * A Firefox OS device

## Roadmap

1. App memory history
  1. Keep killed apps
  2. Show min/max and avg/mean for `USS`/`PSS`
2. GUI & graphs
3. about:memory details