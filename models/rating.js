var mongoose = require('mongoose');

var ratingSchema = new mongoose.Schema({
    userid: mongoose.Schema.Types.ObjectId,
    rating: {type :Number,min:1,max:5,default:0},
});

exports.Rating = mongoose.model('rating',ratingSchema);
exports.ratingSchema = ratingSchema;