#!/bin/zsh
#
# Download starlink data as jsonified protobuf to YYYY-MM-DD-HHMM.json

setopt CONTINUE_ON_ERROR

STARLINK=192.168.100.1

# Filename generation is delayed, so we get the closest time if ping takes a while to connect.
FILE_DATE_FORMAT="+%Y-%m-%d-%H%M%S"
SUCCESS_EXT=".json"
FAILURE_EXT=".fail"

# It's likely that launchd is often going to run this right after the machine wakes up. Give the network a chance to connect by waiting ~30sec for a successful ping to the dish.
ping -c 30 -o ${STARLINK}
if [ $? -ne 0 ]; then
    RESULT_FILE=`date ${FILE_DATE_FORMAT}`${FAILURE_EXT}
    echo "Dish not reachable at ${STARLINK}" > ${RESULT_FILE}
    exit -1;
fi

RESULT_FILE=`date ${FILE_DATE_FORMAT}`
/usr/local/bin/grpcurl -plaintext -d {\"get_history\":{}} ${STARLINK}:9200 SpaceX.API.Device.Device/Handle > ${RESULT_FILE}${SUCCESS_EXT}
if [ $? -ne 0 ]; then
    mv ${RESULT_FILE}${SUCCESS_EXT} ${RESULT_FILE}${FAILURE_EXT}
    exit -1;
fi
