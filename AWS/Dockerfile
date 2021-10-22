FROM ubuntu:18.04

# Run OS updates
RUN apt update

# Install required OS dependencies 
WORKDIR /home
RUN apt install -y curl
RUN curl -sL https://deb.nodesource.com/setup_13.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt install -y nodejs
RUN apt install -y git

# Pull repo from Github
RUN git clone https://<USERNAME>:<PASSWORD_OR_KEY>@github.com/norbi-rackspace/MPC-Tools.git

# Install repo dependencies
WORKDIR /home/MPC-Tools/AWS
RUN npm install
WORKDIR /home/MPC-Tools/AWS/SharedModules
RUN npm install

# Download the FAWS CLI and extract 
RUN curl -l https://s3.amazonaws.com/faws-toolbox.rax.io/v2.1.0/faws-linux.zip > /home/faws-linux.zip
WORKDIR /usr/bin
RUN apt install -y unzip
RUN unzip /home/faws-linux.zip -d /usr/bin

# Clean up
RUN rm -rf /home/faws-linux.zip
RUN rm /home/nodesource_setup.sh



