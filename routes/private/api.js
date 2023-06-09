const { isEmpty } = require("lodash");
const { v4 } = require("uuid");
const db = require("../../connectors/db");
const roles = require("../../constants/roles");
const {getSessionToken}=require('../../utils/session')
const getUser = async function(req) {
  const sessionToken = getSessionToken(req);
  console.log("hi",sessionToken)
  if (!sessionToken) {
    return res.status(301).redirect('/');
  }

  const user = await db.select('*')
    .from('se_project.sessions')
    .where('token', sessionToken)
    .innerJoin('se_project.users', 'se_project.sessions.userid', 'se_project.users.id')
     .innerJoin('se_project.roles', 'se_project.users.roleid', 'se_project.roles.id')
     .first();
 
  console.log('user =>', user)
  user.isNormal = user.roleid === roles.user;
  user.isAdmin = user.roleid === roles.admin;
  user.isSenior = user.roleid === roles.senior;
  console.log("user => ",  user)
  return user;  
}

module.exports = function (app) {
  // example
  app.get("/users", async function (req, res) {
    try {
       const user = await getUser(req);
      const users = await db.select('*').from("se_project.users")
          
      return res.status(200).json(users);
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Could not get users");
    }
   
  });

// user endpoints
//user Api
// buying sub
app.post("/api/v1/payment/subscription", async (req, res) => {
  try {
    const { creditCardNumber, holderName, payedAmount, subType, zoneId } = req.body;
    const user = await getUser(req);
    const userId = user.id;
    let noOfTickets = 0;

    const existingSubscription = await db("se_project.subscription").select("userid").where("userid", userId).first();
  
    if (existingSubscription) {
      return res.status(400).send("Subscription already exists");
    } else {
      if (subType === "annual" && payedAmount === 1500) {
        noOfTickets = 100;
      } else if (subType === "quarterly" && payedAmount === 1000) {
        noOfTickets = 50;
      } else if (subType === "monthly" && payedAmount === 500) {
        noOfTickets = 10;
      } else {
        console.log("subType:", subType);
        console.log("payedAmount:", payedAmount);
        return res.status(400).send("Subscription you want to buy does not exist");
      }
      
      //const t = await db("se_project.transactions").insert().returning("*"); //When written error empty query

      let newTransaction = {
        userid: userId,
        purchasedid:4,//Insertion query not request parameter??
        amount: payedAmount,
      };
      const addedTransaction = await db("se_project.transactions").insert(newTransaction) .returning("*");
      console.log(addedTransaction); 

      let newSubscription = {
        userid: userId,
        subtype: subType,
        zoneid: zoneId,
        nooftickets: noOfTickets,
      };

      const addedSubscription = await db("se_project.subscription").insert(newSubscription).returning("*");
      console.log(addedSubscription);
      
      return res.status(201).json("Subscription purchased");
    }
  } catch (err) {
    console.log("error message", err.message);
    return res.status(400).send(err.message);
  }
});

//refund ticket
app.post("/api/v1/refund/:ticketId", async (req, res) => {
try {
  const { ticketId } = req.body;
    const user = await getUser(req);
    const userId = user.id;
    const exist = await db("se_project.tickets").where("id", ticketId).returning("*");

  if (exist.length === 0) {
    return res.status(400).send("Ticket doesn't exist");
  } else {
    let refundedticket = {
      status: "pending",
      userid: userId,
      refundamount: 0,
      ticketid: ticketId,
    };

    const sub = await db("se_project.subscription").select("id").where("userid", userId).returning("*").first();
    //check if user has subscription or not
    if (!sub) {
      //user has subscription
      const refund = await db("se_project.refund_requests").insert(refundedticket).returning("*");
      console.log("refund 1",refund)
      if(!(refund.length)== 0){
      return res.status(200).send("Refund requested successfully");
      }else{
        return res.status(400).send("Error");
      }
    } else {
      //user doesnt have subscription
      const paidAmount =await db("se_project.transactions").select("amount").returning("amount").first();
      console.log("paidAmount",paidAmount);
      parsedpaid = parseInt(paidAmount.amount);
      console.log("Parsed",parsedpaid);
      refundedticket.refundamount =parsedpaid;
      const refund = await db("se_project.refund_requests").insert(refundedticket).returning("*");
      console.log("REFUND",refund);
      if(!(refund.length)== 0){
        return res.status(200).send("Refund requested successfully");
        }else{
          return res.status(400).send("Error");
        } 
    }
  }
} catch (err) {
  console.log("error message", err.message);
  return res.status(400).send(err.message);
}
});


//buying ticket online
app.post("/api/v1/payment/ticket", async (req, res) => {
  try {
    const { creditCardNumber, holderName, payedAmount, origin, destination, tripDate } = req.body;
    const user = await getUser(req);
    const userId = user.id;
    //const price = checkPrice(origin, destination);
    const existingSubscription = await db("se_project.subscription").select("userid").where("userid", userId).first();

    if (existingSubscription) {
      return res.status(400).send("You have a subscription, you don't need to pay");
    }// else if (payedAmount < price) {
      //return res.status(400).send("Not sufficient funds");
    //}
     else {
      let newTransaction = {
        userid: userId,
        purchasedid: 4,
        amount: payedAmount,
      };
      console.log("New transaction", newTransaction);

      let newTicket = {
        userid: userId,
        origin,
        destination,
        tripdate: tripDate,
      };
      const [insertedTicket] = await db("se_project.tickets").insert(newTicket).returning("id");
      const newticketid = insertedTicket.id;
      console.log("New Ticket ID:", newticketid);

      let newRide = {
        status: "Upcoming",
        origin,
        destination,
        userid: userId,
        ticketid: newticketid,
        tripdate: tripDate,
      };

      const transaction = await db("se_project.transactions").insert(newTransaction).returning("*");
      const ride = await db("se_project.rides").insert(newRide).returning("*");
      console.log("Transaction", transaction);
      console.log("Ride",ride);
      // Indicate the full ticket price, route, and transfer stations
      console.log("Ticket price", payedAmount, "from", origin, "to", destination);
    }
  } catch (err) {
    console.log("Error message", err.message);
    return res.status(400).send(err.message);
  }
});

//buying ticket through sub
app.put("/api/v1/tickets/purchase/subscription", async (req, res) => {
  try {
    const { subId, origin,destination,tripDate } = req.body;
    const user = await getUser(req);
    const userId = user.id;
    const x = await db("se_project.subscription").select("").where("id",subId).returning("").first();
    console.log(x);
    if(!x){
      return res.status(400).send("You dont have a subscription");
    }else{
      let newTicket = {
        userid: userId,
        origin,
        destination,
        tripdate: tripDate,
      };
      const [insertedTicket] = await db("se_project.tickets").insert(newTicket).returning("id");
      const newticketid = insertedTicket.id;
      console.log("New Ticket ID:", newticketid);

      let newRide = {
        status: "Upcoming",
        origin,
        destination,
        userid: userId,
        ticketid: newticketid,
        tripdate: tripDate,
      };

      
      const ride = await db("se_project.rides").insert(newRide).returning("*");        
      console.log("Ride",ride);

      let ntickets =await db("se_project.subscription").select("nooftickets").where("id", subId).returning("nooftickets").first();
      console.log("Number of tickets before",ntickets);
      ntickets = ntickets.nooftickets-1;
      const update = await db("se_project.subscription").where("id", subId).update({ nooftickets: ntickets }).returning("nooftickets");   
      console.log("Number of tickets after",update); 
      if(update){
        return res.status(200).json({ message: "Purchase complete" });
      }else{
        return res.status(400).json({ message: "Failed to update" });
      }
    }
  } catch (err) {
    console.log("Error message", err.message);
    return res.status(400).send(err.message);
  }
});

//senior request
app.post("/api/v1/senior/request", async (req, res) => {
try{
const {nationalId} = req.body
const user = await getUser(req);
const userId = user.id;
let seniorreq ={
status:"pending",
userid:userId,
nationalid:nationalId
};
console.log("senior",seniorreq);
const addedreq = await db("se_project.senior_requests").insert(seniorreq).returning("*");
console.log("req",addedreq);

} catch (err) {
console.log("Error message", err.message);
return res.status(400).send(err.message);
}
});
app.put("/api/v1/ride/simulate", async function(req, res) {
  const { origin, destination, tripdate, userid, ticketid } = req.body; // done

  try {
    // Simulate the ride
    const updatedRides = await db("se_project.rides")
      .where({
        origin: origin,
        destination: destination,
        tripdate: tripdate,
        userid: userid,
        ticketid: ticketid
      })
      .update({
        status: "completed"
      });

    // Check if any rides were updated
    if (updatedRides === 0) {
      return res.status(404).send("No rides found to simulate");
    }

    const savedRides = await db("se_project.rides")
      .where({
        origin: origin,
        destination: destination,
        tripdate: tripdate,
        userid: userid,
        ticketid: ticketid
      })
      .select("*");

    return res.status(200).json(savedRides);
  } catch (error) {
    console.log(error);
    return res.status(500).send("Error simulating ride");
  }
});

  //ahmed 
// User Reset Password 
app.put("/api/v1/password/reset", async function (req, res) {
  const { newPassword } = req.body
  // If the password is not present return an HTTP error code
  if (!newPassword) {
    return res.status(400).send("New Password is required");
  }
  const user = await getUser(req);
  // upadate password in db with new one
  user.password = newPassword
  res.status(200).send("Rest Password successful")
});

// Get Zones Data
app.get("/api/v1/zones", async function (req, res) {
  let query = `INSERT INTO se_project.zones (zonetype, price) VALUES ?;`;
  const values = [
    ['9 stations', 5],
    ['from 10 to 16 station', 7],
    ['more than 16 station', 10]
  ];
  //db.query(query, [values])

  const zones = await db.select("*").from("se_project.zones")
  res.status(200).json( values)

})
//check price
app.get("/api/v1/tickets/price/:originId/:destinationId", async (req, res) => {
  try {
    const { originId, destinationId } = req.body;
    console.log("!",originId,"@",destinationId);
    async function getStationsPassedByUser(originId, destinationId) {
      const routes = await db("se_project.routes").select("fromStationid").returning('*');
      //haga te check en el originID we el destinationID mawgoden fel routes
      if(!routes.includes(originId) || !routes.includes(destinationId)){
        return res.status(400).send("originID or destinationID doesn't exist");
      }else if (originId === destinationId) {
        return 0 ;
      }else{
      let stationsPassed = 0;
      const arrstations = [];
      arrstations.push(originId);
      stationsPassed = await getStationsPassedByUser1(parseInt(originId), parseInt(destinationId), arrstations,stationsPassed);
      return stationsPassed;
      }
    }
    
    async function getStationsPassedByUser1(fromStationId, toStationId, arrstations, stationsPassed) {
      const routes = await db("se_project.routes").select("fromstationid", "tostationid").where("fromstationid", fromStationId);
      for (const route of routes) {
        if (route.fromstationid === toStationId) {
          return stationsPassed;
        } else if ( !arrstations.includes(route.tostationid)) {
          arrstations.push(route.fromstationid);
          let stationsPassed = await getStationsPassedByUser1(route.tostationid, toStationId, arrstations, stationsPassed+1,);  
        }
      }
    }
    
    let price =0;
    const passed = getStationsPassedByUser(originId,destinationId);
    if (passed<=5){
      let price = 5;
    }else if (passed>5 && passed<=7){
      let price = 7;
    }else if (passed>7 && passed<=10){
      let price =10;
    }

    return res.status(200).json({ price:0 });
  } catch (err) {
    console.log("error message", err.message);
    return res.status(400).send(err.message);
  }
});




//admin endpoints 
// station parts
  app.post("/api/v1/station", async function (req, res) {
    try {
      const admin = await getAdmin(req);
      const { stationName } = req.body;
  
      if (!stationName) {
        return res.status(400).json({ message: "Station name is required" });
      }
  
  
      const stationType = ["normal" , "transfer"] ;
      const stationPosition = ["start" , "middle" , "end"]
      const newStation = await db("se_project.stations").insert({
        stationname: stationName,
        stationposition: stationPosition, 
        stationstatus: "normal",
        stationtype: stationType, 
      });   
  
      return res.status(200).json({ message: "Station created successfully" });
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Station cannot be created");
    }
  });
  app.put("/api/v1/station/:stationId", async function (req, res) {
    try {
      const admin = await getAdmin(req);
      const { stationName } = req.body;
      const stationId = parseInt(req.params.stationId);
      // check lw station exists 
      if (isNaN(stationId)) {
        return res.status(400).json({ message: "Invalid station ID, Please Re-Enter the ID" });
      }
  
      await db("se_project.stations")
        .where({ id: stationId })
        .update({ stationname: stationName });
  
      return res.status(200).json({ message: "Station updated successfully" });
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Station could not be updated");
    }
  });
  //ziad 
  //delete stations
  app.delete("/api/v1/station/:stationId", async function (req, res) {
    try {
      const admin = await getAdmin(req);
      
     /* if (!admin) {
        return res.status(400).json({ message: "Unauthorized" });
      }*/
  
      const stationId = req.params.stationId;
  
      
      const station = await db("se_project.stations")
      .where({ id: stationId })
      .first();
  
      if (!station) {
        return res.status(404).json({ message: "Station not found" });
      }
  
    
      await db("se_project.stations").where({ id: stationId }).del();
  
      // Delete the connected routes
      const deletedRoutes = await db("se_project.routes")
        .where("fromStationid", stationId)
        .orWhere("toStationid", stationId)
        .del();
  
      // Create new routes and update their names
      const newRoutes = [];
      const updatedRoutes = [];
  
      if (deletedRoutes > 0) {
        const connectedRoutes = await db("se_project.routes")
          .where("fromStationid", stationId)
          .orWhere("toStationid", stationId);
  
        for (const route of connectedRoutes) {
          const newRoute = {
            fromStationid: route.fromStationid === stationId ? null : route.fromStationid,
            toStationid: route.toStationid === stationId ? null : route.toStationid,
            routeName: `new-${route.routeName}` // Update the route name
          };
  
          const createdRoute = await db("se_project.routes").insert(newRoute).returning("*");
          newRoutes.push(createdRoute);
          updatedRoutes.push(route.id);
        }
      }
  
  
      const stationRoutes = [];
      for (const newRoute of newRoutes) {
        const stationRoute = {
          stationId: stationId,
          routeId: newRoute.id
        };
        const createdStationRoute = await db("se_project.stationRoutes").insert(stationRoute).returning("*");
        stationRoutes.push(createdStationRoute);
      }
  
      await db("se_project.stationRoutes")
        .whereIn("routeId", updatedRoutes)
        .update({ routeName: `new-${route.routeName}` });
  
      return res.status(200).json({ message: "Station and associated routes deleted successfully" });
    } catch (e) {
      console.log(e.message);
      return res.status(400).send("Could not delete station");
    }
  });
  
  
  

  // dani
//route parts
app.post("/api/v1/route", async (req, res) => {
  try {
    const { newStationId, connectedStationId, routeName } = req.body;

    // b checl stations mawgooda wla laa fl table
    const newStation = await db("se_project.stations")
      .where("id", newStationId)
      .first();

    const connectedStation = await db("se_project.stations")
      .where("id", connectedStationId)
      .first();

    if (!newStation || !connectedStation) {
      return res.status(404).send("One or more stations do not exist");
    }

  

    let newStationPosition, connectedStationPosition;

    // Check if the connected station is at the start of a route
    const connectedToStart = await db("se_project.routes")
      .where("fromstationid", connectedStationId)
      .first();

    if (connectedToStart) {
      newStationPosition = "end";
      connectedStationPosition = "start";
    } else {
      newStationPosition = "start";
      connectedStationPosition = "end";
    }

    // Create the new route
    const newRoute = await db("se_project.routes")
      .insert({
        routename: routeName,
        fromstationid: newStationId,
        tostationid: connectedStationId
      })
      .returning("*");


    await db("se_project.stations")
      .where("id", newStationId)
      .update({ stationposition: newStationPosition });

    await db("se_project.stations")
      .where("id", connectedStationId)
      .update({ stationposition: connectedStationPosition });

    return res.status(201).send("route created successfully : ").json(newRoute);
  } catch (err) {
    console.log("error message", err.message);
    return res.status(500).send("Cannot create route, Please Try Again");
  }
});

  
app.put("/api/v1/route/:routeId", async function (req, res) {
  try {
    const { routeName } = req.body;
    const { routeId } = req.params;
    const route = await db("se_project.routes").where({ id: routeId }).first();
    if (!route) {
      return res.status(404).send("Route not found");
    }
    const updatedRoute = await db("se_project.routes")
      .update({ routename: routeName })
      .where({ id: routeId });

    if (updatedRoute === 1) {
      return res.status(200).json({ message: "Route updated successfully" });
    }
  } catch (e) {
    console.log(e.message);
    return res.status(400).send("Could not update route");
  }
});
app.delete("/api/v1/route/:routeId", async function(req, res) {
  try {
    const { routeId } = req.params;

  
    const routeExists = await db("se_project.routes").where({ id: routeId }).first();
    if (!routeExists) {
      return res.status(404).send("Cannot find Route, thus cannot be deleted");
    }

  
    await db("se_project.routes").where({ id: routeId }).del();

    
    const { fromstationid, tostationid } = routeExists;

   // check lw el stations lesa feeha routes
    const fromStationRoutes = await db("se_project.routes").where({ fromstationid });
    const toStationRoutes = await db("se_project.routes").where({ tostationid });

    
    if (fromStationRoutes.length === 0) {
      await db("se_project.stations").where({ id: fromstationid }).update({ stationposition: null });
    }
    if (toStationRoutes.length === 0) {
      await db("se_project.stations").where({ id: tostationid }).update({ stationposition: null });
    }

    return res.status(200).json({ message: "Route deletion completed" });
  } catch (e) {
    console.log(e.message);
    return res.status(400).send("Route couldn't be deleted");
  }
});

app.put("/api/v1/requests/refunds/:requestId", async function(req, res) {
  try {
    const { refundStatus } = req.body;
    const requestId = parseInt(req.params.requestId, 10);

    if (isNaN(requestId)) {
      return res.status(400).json({ message: "Invalid requestId" });
    }

    const refundRequest = await db("se_project.refund_requests")
      .where({ id: requestId })
      .first();

    if (!refundRequest) {
      return res.status(404).json({ message: "Refund request not found" });
    }

    await db("se_project.refund_requests")
      .where({ id: requestId })
      .update({ status: refundStatus });

    if (refundStatus === "accepted") {
      const ticket = await db("se_project.tickets")
        .where({ id: refundRequest.ticketid })
        .first();
      //checking in el trip lsa fl future, is yes hn delete-ha
      if (ticket && ticket.tripdate > new Date()) {
        await db("se_project.tickets")
          .where({ id: refundRequest.ticketid })
          .del();

        if (ticket.subid) {
          const subscription = await db("se_project.subscription")
            .where({ id: ticket.subid })
            .first();

          if (subscription) {
            const validSubscription = await db("se_project.subscription")
              .where({ id: ticket.subid })
              .update({ numTickets: subscription.nooftickets + 1 });

            if (validSubscription === 1) { //checking subscription 
              return res.status(200).json({ message: "Subscription: valid, Refund completed successfully" });
            } else {
              return res.status(500).json({ message: "Refund failed" });
            }
          } else {
            return res.status(404).json({ message: "No subscription to be found, thus cannot perform refund request" });
          }
        } else {
          const transaction = await db("se_project.transactions")
            .where({ id: ticket.transactionid })
            .first();

          if (transaction) {   
            const completedTransaction = await db("se_project.transactions")
              .where({ id: ticket.transactionid })
              .update({ amount: 0 });

            if (completedTransaction === 1) {
              return res.status(200).json({ message: "Transaction: found, Refund completed successfully" });
            } else {
              return res.status(404).json({ message: "No transaction with the specified ID to be found, thus cannot perform refund request" });
            }
          }
        }
      }
    } else {
      return res.status(200).json({ message: "Refund request rejected" });
    }

    return res.status(200).json({ message: "Refund request completed successfully" });
  } catch (e) {
    console.log(e.message);
    return res.status(400).send("Could not complete refund request");
  }
});


 app.put("/api/v1/requests/senior/:requestId", async function(req, res) {
  try {
    const { seniorStatus } = req.body;
    const requestId = parseInt(req.params.requestId, 10);
     
    if(isNaN(requestId)){
      return res.status(400).json({message: "Invalid Request Id, Please Try again"});
    }
    // fetching or chekcing lw fi refund request
    const seniorRequest = await db("se_project.senior_requests")
    .where({id:requestId})
    .first();
    if(!seniorRequest){
      return res.status(404).json({message: "Cannot find senior request"});
    }

    if (seniorStatus === "accepted"){
      await db ("se_project.senior_requests")
      .where({id:requestId})
      .update({status : seniorStatus})
      return res.status(201).json({message: "Senior Request accepted succefully"});
    }else if (seniorStatus === "rejected"){
      await db ("se_project.senior_requests")
      .where({id:requestId})
      .update({status : seniorStatus})
      return res.status(201).json({message: "Senior Request rejected succefully"});
    }else {
      return res.status(400).json({ message: "Invalid seniorStatus value" });
    }
  }catch(e) {
    console.log(e.message);
    return res.status(400).send("Couldn't review Request");
  }
});

app.put("/api/v1/zones/:zoneId", async function(req, res) {
  try {
    const { price } = req.body;
    const zoneId = parseInt(req.params.zoneId, 10);

    if (isNaN(zoneId)) {
      return res.status(400).json({ message: "Invalid zoneId" });
    }

    const zone = await db("se_project.zones")
      .where({ id: zoneId })
      .first();

    if (!zone) {
      return res.status(404).json({ message: "Cnnot find specified zone, please try again" });
    }

    await db("se_project.zones")
      .where({ id: zoneId })
      .update({ price: price });

    return res.status(200).json({ message: "Zone price updated successfully" });
  } catch (e) {
    console.log(e.message);
    return res.status(400).send("Zone price couldnt be updated");
  }
});



};


  


