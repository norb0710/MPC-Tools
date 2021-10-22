#!/bin/bash

mkdir "Customers"

while IFS= read -r line
do
    mkdir "Customers/$line"
    node main.js --DDI $line --ssoUsername $2 --reportType Patching
    node main.js --DDI $line --ssoUsername $2 --reportType Monitoring
    node main.js --DDI $line --ssoUsername $2 --reportType Backups
done < "$1"