var mongoose = require('mongoose');


var userSchema = new mongoose.Schema({
    username:{type:String,required:true},
    email:{type:String,required:true},
    password:{type:String,required:true},
    role:{type:String,required:true},
    avatar:String,
    createdAt: { type: Date, required: true, default: Date.now},
    exams:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"exam"
    }]
})
var User = mongoose.model('user',userSchema);


module.exports = User