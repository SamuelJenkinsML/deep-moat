#!/bin/sh
cd "$(dirname "$0")" && node ascii.js && for n in 16 32 48 128; do rsvg-convert -w $n -h $n logo.svg -o $n.png; done
