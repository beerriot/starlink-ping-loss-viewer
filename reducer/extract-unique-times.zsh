#!/bin/zsh
#
# Reduce group of downloaded histories to their unique, non-overlapping spans.
#

usage() {
    echo "Usage: $ZSH_ARGZERO <output directory> file1 [file2 ...]"
}

[[ $1 == "-h" ]] && usage && exit 0
[[ $# -lt 2 ]] && echo "Error: missing parameters" && usage && exit -1

OUTDIR=$1

[[ ! -d $OUTDIR ]] && echo "Making output directory ${OUTDIR}" && mkdir -p $OUTDIR

ERROR=0
PREVIOUS=""
shift
while [[ -n $1 ]]; do
    [[ ! -f $1 ]] && print "Could not find file $1 .. skipping" && ERROR=$(( $ERROR + 1)) && shift && continue
    
    # current is a string, so -r to print without quotes
    CURRENT=`jq -r .dishGetHistory.current $1`
    [[ $? -ne 0 || -z $CURRENT ]] && print "Could not extract current timestamp from $1 .. skipping" && ERROR=$(( $ERROR + 1)) && shift && continue

    LENGTH=`jq ".dishGetHistory.snr|length" $1`
    [[ $? -ne 0 || -z $LENGTH ]] && print "Could not extract ring buffer size from $1 .. skipping" && ERROR=$(( $ERROR + 1)) && shift && continue

    NEXT_DATAPOINT=$(( $CURRENT % $LENGTH ))

    # Cases:
    #  x first file in the series, brand new, less than 12hr boot
    #     [0:CURRENT]
    #  x first file in the series, older than 12hr boot
    #     [CURRENT:LENGTH]+[0:CURRENT] (note that this works for CURRENT=0)
    #  x Nth file in the series, CURRENT > LENGTH + PREVIOUS
    #     [CURRENT:LENGTH]+[0:CURRENT]
    #  x Nth file in the series, CURRENT < LENGTH + PREVIOUS, (CURRENT % LENGTH) > (PREVIOUS % LENGTH)
    #     [(PREVIOUS % LENGTH):(CURRENT%LENGTH)]
    #  x Nth file in the series, CURRENT < LENGTH + PREVIOUS, (CURRENT % LENGTH) < (PREVIOUS % LENGTH)
    #     [(PREVIOUS % LENGTH):LENGTH]+[0:(CURRENT % LENGTH)]

    if [[ $CURRENT -lt $(( $LENGTH +1 )) ]]; then
        # less than 12hr after reset
        SECOND_SPAN=""
        if [[ -z $PREVIOUS || $PREVIOUS -gt $CURRENT ]]; then
            [[ -n $PREVIOUS ]] && echo "Warning: gap of unknown length detected"
            FIRST_SPAN="[0:$CURRENT]";
            NEW_LENGTH=$CURRENT
        else
            # not the first file processed since the reset
            FIRST_SPAN="[$PREVIOUS:$CURRENT]";
            NEW_LENGTH=$(( $CURRENT - $PREVIOUS ))
        fi;
    else
        # more than 12hr after reset
        if [[ -z $PREVIOUS || $CURRENT -gt $(( $PREVIOUS + $LENGTH )) ]]; then
            # more than buffer length since last dump
            [[ -n $PREVIOUS ]] && echo "Warning: gap from ${PREVIOUS} to $(( $CURRENT - $LENGTH )) = $(( $CURRENT - $PREVIOUS - $LENGTH ))"
            FIRST_SPAN="[$(( $CURRENT % $LENGTH )):$LENGTH]"
            SECOND_SPAN="[0:$(( $CURRENT % $LENGTH ))]";
            NEW_LENGTH=$LENGTH
        else
            if [[ $(( $CURRENT % $LENGTH )) -gt $(( $PREVIOUS % $LENGTH )) ]]; then
                # haven't wrapped the ring buffer
                FIRST_SPAN="[$(( $PREVIOUS % $LENGTH)):$(( $CURRENT % $LENGTH ))]"
                SECOND_SPAN="";
            else
                FIRST_SPAN="[$(( $PREVIOUS % $LENGTH)):$LENGTH]"
                SECOND_SPAN="[0:$(( $CURRENT % $LENGTH ))]";
            fi;
            NEW_LENGTH=$(( $CURRENT - $PREVIOUS ))
        fi;
    fi

    echo "$1: time=$CURRENT buffer=$LENGTH next=$NEXT_DATAPOINT $FIRST_SPAN+$SECOND_SPAN=$NEW_LENGTH"

    if [[ -z $SECOND_SPAN ]]; then
        QUERY="downlinkThroughputBps: .downlinkThroughputBps${FIRST_SPAN}, obstructed: .obstructed${FIRST_SPAN}, popPingDropRate: .popPingDropRate${FIRST_SPAN}, popPingLatencyMs: .popPingLatencyMs${FIRST_SPAN}, scheduled: .scheduled${FIRST_SPAN}, snr: .snr${FIRST_SPAN}, uplinkThroughputBps: .uplinkThroughputBps${FIRST_SPAN}";
    else
        QUERY="downlinkThroughputBps: (.downlinkThroughputBps${FIRST_SPAN}+.downlinkThroughputBps${SECOND_SPAN}), obstructed: (.obstructed${FIRST_SPAN}+.obstructed${SECOND_SPAN}), popPingDropRate: (.popPingDropRate${FIRST_SPAN}+.popPingDropRate${SECOND_SPAN}), popPingLatencyMs: (.popPingLatencyMs${FIRST_SPAN}+.popPingLatencyMs${SECOND_SPAN}), scheduled: (.scheduled${FIRST_SPAN}+.scheduled${SECOND_SPAN}), snr: (.snr${FIRST_SPAN}+.snr${SECOND_SPAN}), uplinkThroughputBps: (.uplinkThroughputBps${FIRST_SPAN}+.uplinkThroughputBps${SECOND_SPAN})";
    fi

    # (d)ropped packet ratio
    # (o)bstructed
    # (s)cheduled
    # signal-to-(n)oise ratio
    jq ".dishGetHistory|{dishGetHistory:{current:$NEW_LENGTH, $QUERY}}" $1 > $OUTDIR/$1

    # prepare for next iteration
    shift
    PREVIOUS=$CURRENT
done

[[ $ERROR -gt 0 ]] && echo "Errors were encountered during processing" && exit $ERROR
