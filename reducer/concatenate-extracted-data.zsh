#!/bin/zsh
#
# Concatenate files produced by extract-unique-times into one file.
#
# Output is written to stdout.

usage() {
    echo "Usage: $ZSH_ARGZERO file1 [file2 ...]"
}

[[ $# -lt 1 ]] && echo "Error: missing filename(s)" && usage && exit -1

jq -s "{filenames:map(.filename), current:.[-1].current, data:map(.data)|add}" $@
