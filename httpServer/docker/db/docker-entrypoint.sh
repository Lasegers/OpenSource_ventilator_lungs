#!/bin/bash
#always make sure this file uses linux line endings otherwise you will get https://forums.docker.com/t/standard-init-linux-go-175-exec-user-process-caused-no-such-file/20025
echo "Run customised docker-entrypoint file to enable replication, see original: https://github.com/docker-library/mongo/blob/master/docker-entrypoint.sh"

echo "Remove previous PID file"
rm /pid/mongod.pid

mongodcommand="/usr/bin/mongod --bind_ip_all --replSet rs0"

pidfile="${TMPDIR:-/tmp}/docker-entrypoint-temp-mongod.pid"
rm -f "$pidfile"

$mongodcommand --fork --logpath=./mongo.log --pidfilepath $pidfile --port 27017

mongo="mongo --port 27017"

echo "running init script"

echo $mongo /usr/local/bin/mongo-init.js
echo "--------"
cat /usr/local/bin/mongo-init.js
echo "--------"
echo

$mongo --eval "printjson(rs.initiate({_id: 'rs0',version: 1,members: [{ _id: 0, host : '127.0.0.1:27017' }]}))"
sleep 5
$mongo /usr/local/bin/mongo-init.js

$mongodcommand --shutdown

rm -f "$pidfile"

exec $mongodcommand --pidfilepath /pid/mongod.pid
