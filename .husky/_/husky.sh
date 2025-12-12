#!/bin/sh
if [ -z "$husky_skip_init" ]; then
  if [ "$HUSKY" = 0 ]; then
    return
  fi
  if [ -z "$HUSKY" ]; then
    export HUSKY=1
  fi
  export husky_skip_init=1
  . "$0" "$@"
  exitCode=$?
  unset husky_skip_init
  exit $exitCode
fi
