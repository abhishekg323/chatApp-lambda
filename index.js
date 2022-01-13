const Dynamo = require("./Dynamo");
const AWS = require('aws-sdk');
const tableName = process.env.tableName || "chatApp";
let apigwManagementApi;

const addConnection = async event => {
    const { connectionId} = event.requestContext;
    const data = {
        ID: connectionId,
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
    console.log({connected,action:"sending msg",sender:currID});
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
        await addConnection(event);
        let connected = await Dynamo.getAll(tableName);
        let postData=JSON.stringify({name:"System",role:"sys",msg:"A User Connected, Total Users = "+connected.Items.length});
        await sender(postData,event.requestContext.connectionId,connected);
    }
    else if (event.requestContext.routeKey=="$disconnect"){
        await deleteConnection(event);
        let connected = await Dynamo.getAll(tableName);
        let postData=JSON.stringify({name:"System",role:"sys",msg:"A User Disconnected, Total Users = "+connected.Items.length});
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
