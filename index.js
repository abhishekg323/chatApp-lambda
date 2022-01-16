const Dynamo = require("./Dynamo");
const AWS = require('aws-sdk');
const tableName = process.env.tableName || "chatApp";
let apigwManagementApi;

const addConnection = async event => {
    const { connectionId} = event.requestContext;
    const name = event.queryStringParameters?.name || "unnamed"; 
    const data = {
        ID: connectionId,
        name,
    };
    try{
        await Dynamo.write(data, tableName);
    }
    catch(err){
        console.log(err);
    }
    return { message: 'connected' };
};

const deleteConnection = async event => {
    const { connectionId} = event.requestContext;
    try{
        await Dynamo.delete(connectionId, tableName)
    }
    catch(err){
        console.log(err);
    }    
    return { message: 'disconnected' };
};


const sender= async (postData,currID,connected=null)=>{
    if(!connected)
        connected = await Dynamo.getAll(tableName);
    // console.log({connected,action:"sending msg",sender:currID});
    const postCalls = connected.Items.map(async ({ ID:connectionId }) => {
        try {
            if(connectionId!=currID)
                await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
        } catch (e) {
          if (e.statusCode === 410) {
            console.log(`Found stale connection, deleting ${connectionId}`);
            let disconnected = connectionId;
            await Dynamo.delete(disconnected,tableName);
          } else {
            console.log(e);
          }
        }
    });
    
    try {
        await Promise.all(postCalls);
    } catch (e) {
        console.log(e);
    }
}


exports.handler = async (event) => {
    if(!apigwManagementApi)
        apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
        });
    
    if(event.requestContext.routeKey=="$connect"){
        // console.log(event);
        await addConnection(event);
        let connected = await Dynamo.getAll(tableName);
        const name = event.queryStringParameters?.name; 
        let msg;
        if(!name)
            msg = "An Unnamed User Connected, Total Users = "+connected.Items.length;
        else
            msg = `${name} has Joined The Chat, Total Users = ${connected.Items.length}`;
        let postData=JSON.stringify({name:"System",role:"sys",msg,users:connected.Items.length,reason:"CONNECTED"});
        await sender(postData,event.requestContext.connectionId,connected);
    }
    else if (event.requestContext.routeKey=="$disconnect"){
        let connected = await Dynamo.getAll(tableName);
        let curUser=connected.Items.filter(({ID})=>ID==event.requestContext.connectionId)
        // console.log("disconnected\n",connected.Items,"\n",connected.Items[0]);
        // console.log({curUser});
        let name=curUser[0].name || "unnamed";
        let msg;
        if(name=="unnamed")
            msg = "An Unnamed User Disconnected, Total Users = "+(connected.Items.length-1);
        else
            msg = `${name} has Left The Chat, Total Users = ${connected.Items.length-1}`;
        
        await deleteConnection(event);
        let postData=JSON.stringify({name:"System",role:"sys",msgusers:connected.Items.length-1,reason:"DISCONNECTED"});
        await sender(postData,event.requestContext.connectionId,connected);
        
    }else if(event.requestContext.routeKey=="send"){
        const postData = JSON.parse(event.body).data;
        await sender(postData,event.requestContext.connectionId);
    }
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};
