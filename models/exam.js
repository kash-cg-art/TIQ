var mongoose = require('mongoose');
var User = require('./user');
var Rating = require("./rating");


var questionSchema = new mongoose.Schema({
    statement:String,
    option1:String,
    option2:String,
    option3:String,
    option4:String,
    path:String
})
var Question = mongoose.model('question',questionSchema);
var examSchema = new mongoose.Schema({
    name:String,
    difficulty:String,
    category:String,
    duration:String,
    questions:{type:[questionSchema],validate: [arrayLimit, '{PATH} lower than 1']},
    ratings:{type:[Rating.ratingSchema]},
    avgrating:{type:Number,default:0},
    raters:{type:Number,default:0},
    creatorname:String,
    createdAt: { type: Date, required: true, default: Date.now}
})

function arrayLimit(val) {
    return val.length >= 1;
  }

module.exports = mongoose.model('exam',examSchema);