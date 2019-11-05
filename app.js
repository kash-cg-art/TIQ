var express         = require('express'),
    app             = express(),
    mongoose        = require('mongoose'),
    bp              = require('body-parser'),
    Exam            = require('./models/exam'),
    User            = require('./models/user'),
    Rating          = require('./models/rating').Rating,
    methodOverride  = require('method-override'),
    sessions        = require("client-sessions"),
    bcrypt          = require('bcryptjs'),
    multer          = require('multer'),  //to read multipart form data which is diff from json as it can have files (it parses form data body)(alternate to bp)
    imagemin        = require('imagemin'),//to compress
    imageminMozjpeg = require('imagemin-mozjpeg'),
    imageminPngquant = require('imagemin-pngquant'),
    fs              = require('fs'),//to delete files
    arrayshuffle    = require('array-shuffle');

require('dotenv').config()
const storage = multer.diskStorage({
    destination: function(req,file,cb){
        cb(null,'./public/uploads');
    },
    filename: function(req,file,cb){
        cb(null,Date.now()+req.user.email+file.originalname);//date.now is unix time string
    }
});

const fileFilter = (req,file,cb)=>{
    if(file.mimetype==='image/jpeg'||file.mimetype==='image/png'){
        cb(null,true);
    }
    else{
        cb(null,false);//add new error to throw error
    }
};
const upload = multer({storage:storage,limits:{
    fileSize: 1024*1024*1
},
fileFilter: fileFilter
}
);

// ===============================================
//               MIDDLEWARES
// ===============================================  

app.use('/public',express.static('public'));
app.use(bp.urlencoded({extended:true}));
app.use(bp.json())

app.use(sessions({
    cookieName: 'session', // cookie name dictates the key name added to the request object
    secret: process.env.SESSIONSECRET, // should be a large unguessable string
    duration: 24 * 60 * 60 * 1000, // how long the session will stay valid in ms
    cookie: {
      ephemeral: true, // when true, cookie expires when the browser closes
      httpOnly: true, // when true, cookie is not accessible from javascript
      secure: false // when true, cookie will only be sent over SSL. use key 'secureProxy' instead if you handle SSL not in your node process
    }
  }));

app.use((req,res,next)=>{
    if(!(req.session && req.session.userId)){
        return next();
    }
    
    User.findById(req.session.userId,(err,user)=>{
        if(err){
            return next(err);
        }
        if(!user){
            return next();
        }

        user.password = undefined;

        req.user = user;
        res.locals.user = user;

        next();
    });
});

function loginRequired(req,res,next){
    if(!req.user){
        return res.redirect('/login');
    }
    next();
}
function logoutRequired(req,res,next){
    if(req.user){
        return res.redirect('/');
    }
    next();
}

function isStudent(req,res,next){
    if(req.user.role === 'student'){
        return next();
    }
    return res.redirect('/');
}
function isExaminer(req,res,next){
    if(req.user.role === 'examiner'){
        return next();
    }
    return res.redirect('/');
}

app.use(methodOverride("_method"));

app.use(express.static('public')); 
app.set("view engine", "ejs");

// ===============================================
//                     MONGO
// ===============================================

mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect("mongodb://localhost/exam_app");


// ===============================================
//                     ROUTES
// ===============================================
app.post('/user/upload',loginRequired,upload.single('avatar'),(req,res)=>{
    if(typeof req.file != 'undefined'){
        User.findById(req.user.id,(err,user)=>{
            if(user.avatar){
                fs.unlink('.'+user.avatar, (err) => {
                    if (err) {
                      console.error(err)
                      return
                    }
                    console.log(user.avatar + 'deleted')
                    //file removed
                  });
            }
        })
        User.findByIdAndUpdate(req.user.id,{avatar:'/public/uploads/'+req.file.filename},{new:true},(err,user)=>{
            if(err){
                console.log(err);
            }
            else{
                (async () => {
                    f = await imagemin(['./public/uploads/'+req.file.filename], {
                        destination: './public/uploads/',
                        plugins: [
                            imageminMozjpeg(),
                            imageminPngquant({
                                quality: [0.5, 0.7]
                            })
                        ]
                    });console.log(f);
                    
                })();
                console.log(user);
                res.redirect('/');
            }
        })
    }else{
        res.redirect('/');
    }
})
app.get('/',function(req,res){
    if(!req.user){
        return res.redirect('/login');
    }
    if(req.user.role == 'examiner'){
        return res.redirect('/examiner/exam')
    }
    if(req.user.role == 'student'){
        return res.redirect('/student')
    }
    return res.redirect('/logout');
});

// ===============================================
//               EXAMINER ROUTES
// ===============================================

// INDEX EXAM
app.get('/examiner/exam',loginRequired,isExaminer,upload.any(),function(req,res){
    User.findOne({email:req.user.email}).populate("exams").exec(function(err,user){
        if(err){
            console.log(err);
        }
        else{
            // console.log(user);
            // console.log(user.exams);

            res.render('examiner/index',{exams:user.exams});
            // res.send(user);
        }
    })
});
// NEW EXAM
app.get('/examiner/exam/new',loginRequired,isExaminer,function(req,res){
    res.render('examiner/new');
});

// CREATE EXAM
app.post('/examiner/exam',loginRequired,isExaminer,upload.any(),function(req,res){
    console.log(req.files);
    

    var length = Object.keys(req.body).length - 1;
    var examnew = new Exam({
        name: req.body['exam']['name'],
        difficulty: req.body['exam']['difficulty'],
        category: req.body['exam']['category'],
        duration: req.body['exam']['duration'],
        creatorname: req.user.username
    });
    for(i = 0 ; i< length; i++){
        var qn = 'question' + (i+1);
        var path = null;
        req.files.forEach(function(file){
            
            if(file.fieldname===qn+'[diagram]'){
                (async () => {
                    f = await imagemin(['./public/uploads/'+file.filename], {
                        destination: './public/uploads/',
                        plugins: [
                            imageminMozjpeg(),
                            imageminPngquant({
                                quality: [0.5, 0.7]
                            })
                        ]
                    });console.log(f);
                    
                })();
                path = '/public/uploads/' + file.filename;
            }
        });
        examnew.questions.push({
            statement: req.body[qn]['statement'],
            option1: req.body[qn]['option1'],
            option2: req.body[qn]['option2'],
            option3: req.body[qn]['option3'],
            option4: req.body[qn]['option4'],
            path: path
        });
    }
    examnew.save(function(err,exam){                            //HANDLE IT PROPERLY
        if(err){
            console.log(err);
            res.redirect('/');
        }
        else{
            User.findById(req.user.id,(err,user)=>{
                if(err){
                    console.log(err);
                    res.redirect('/');
                }
                else{
                    user.exams.push(exam);
                    user.save((err,user)=>{
                        if(err){
                            console.log(err);
                        }
                        else{
                            console.log(user);                            
                        }
                    });
                }
            });
            res.redirect('/examiner/exam/'+exam.id);
        }
    });
});


// SHOW EXAM
app.get('/examiner/exam/:id',loginRequired,isExaminer,function(req,res){
    var id = req.params.id;
    Exam.findById(id,function(err,exam){
        if(err){
            console.log(err);
        }
        else{
            res.render('examiner/show',{exam:exam});
        }
    });
});

// DELETE
// https://www.youtube.com/watch?v=5iz69Wq_77k cascading delete in model itself
app.delete('/examiner/exam/:id',loginRequired,isExaminer,function(req,res){
    User.findOne({ exams: { $all: { _id : req.params.id } } },function(err,user){ //find user where exam._id = params id
        if(err){
            console.log(err)
        }else{
            if(user._id == req.user.id){        //if it is the creator of exam then delete (get the found user's id and compare with the one's who is logged in)
                Exam.findById(req.params.id,function(err,exam){
                    if(err){
                        console.log(err);
                    }
                    else{
                        exam.questions.forEach(function(que){
                            if(typeof que.path != 'undefined'||que.path !== null){
                                fs.unlink('.'+que.path, (err) => {
                                    if (err) {
                                      console.error(err)
                                      return
                                    }
                                    console.log(que.path + 'deleted')
                                    //file removed
                                  });
                            }
                        })//deletes files associated with that exam
                        exam.remove(function(err,exam){
                            if(err){
                                res.redirect('/examiner/exam');
                            }else{
                                User.findByIdAndUpdate(user.id,{$pull:{exams:{ $in: exam.id }}},(err,user)=>{//cascading delete
                                    if(err){
                                        console.log(err)
                                    }else{
                                        console.log('updated')
                                    }
                                    }
                                )    
                                res.redirect('/examiner/exam');
                            }
                        })
                    }
                })
            }
            else{
                res.redirect('/examiner/exam');
            }
        }
    });
});

// ===============================================
//                 AUTH ROUTES
// ===============================================

app.get('/login',logoutRequired,function(req,res){
    if(req.user){
        console.log('yeet')
    }
    res.render('login');
});
app.post('/login',(req,res)=>{
    User.findOne({email:req.body.user.email},(err,user)=>{
        if(err||!user||!bcrypt.compareSync(req.body.user.password,user.password)){
            return res.render('login',{
                error:'incorrect mail/pass'
            });
        }

        req.session.userId = user._id;
        res.redirect("/");
    });
});

app.get('/register',logoutRequired,function(req,res){
    res.render('register');
});

app.post('/register',function(req,res){
    let hash = bcrypt.hashSync(req.body.user.password,14);
    req.body.user.password = hash; 
    console.log(req.body.user)
    User.findOne({email: req.body.user.email},(err,user)=>{
        if(err){
            console.log(err)
        }
        else{
            console.log('user'+user);
            if(!user){
                let newuser = new User(req.body.user);

                newuser.save((err,user)=>{
                    if(err){
                        console.log(err);
                        return res.render('register',{error:err});
                    }
                    console.log(user);
                    return res.redirect('/login');
                });
            }else{
                var error = "email taken"
                return res.render('register',{error:error})
            }
        }
    })

});

app.get('/logout/:id',loginRequired,(req,res)=>{
    if(req.user.id === req.params.id){
        req.session.userId = null;
        req.user = undefined;
        res.locals.user = undefined;
        res.redirect('/login');
    }
});

// ===============================================
//                STUDENT ROUTES
// ===============================================

app.get('/student',loginRequired,isStudent,(req,res)=>{
    return res.render('student/index');
});

app.get('/student/search',loginRequired,isStudent,(req,res)=>{
    var spc = /^\s*$/;//to test if query is not all spaces
    if(typeof req.query.s == 'undefined'|| spc.test(req.query.s)){
        res.redirect('/student');
    }
    else{
        var reg = new RegExp(req.query.s);
        // { $or: [ {'name':{ $regex: reg, $options: 'i' }}, { 'creatorName': { $regex: reg, $options: 'i' } } ] }
        // var query = {'name':{ $regex: reg, $options: 'i' }}
        var query = { $or: [ {'name':{ $regex: reg, $options: 'i' }}, { 'creatorname': { $regex: reg, $options: 'i' } } ] }
        if(req.query.difficulty !== 'all'){
            query['difficulty']=req.query.difficulty;
        }
        if(req.query.category!== ''){
            query['category']=req.query.category;
        }
        Exam.find(query).sort({createdAt:-1}).exec(function(err,exams){
            if(err){
                console.log(err);
            }
            else{
                var ctr = 0
                if(exams.length!=0){
                exams.forEach(function(exam){
                    User.findOne({ exams: { $all: { _id : exam._id } } },function(err,user){ //to do it synchronously ;-;
                        if(err){
                           ctr++ ;
                            console.log(err);
                            if(ctr==exams.length){
                                console.log(exams);
                                res.render('student/index',{message:err});
                            }
                        }
                        else{
                            ctr++;
                            exam['creatorid'] = user._id;
                            exam['creatoravatar'] = user.avatar;
                            if(ctr==exams.length){
                                console.log(exams);
                                res.render('student/index',{exams:exams,query:query});
                            }
                        }
                    });
                });
            }
            else{
                res.render('student/index',{message:'no results found'});
            }
            }
        });
    }
})

app.get('/student/examiner/:id',loginRequired,isStudent,(req,res)=>{
    User.findById(req.params.id).populate("exams").exec((err,user)=>{//exposing id :(
        if(err){
            console.log(err);
        }
        else{
            console.log(user);
            res.render('student/show',{user:user});
        }
    });
});

app.get('/student/exam/:id',loginRequired,isStudent,(req,res)=>{
    Exam.findById(req.params.id,(err,exam)=>{
        if(err){
            console.log(err);
            res.redirect('/');
        }
        else{
            let rated = false;
            exam.ratings.forEach(function(rating){
                if(rating.userid==req.user.id){
                    rated=true;
                }
            })
            var count = 0
            exam.questions.forEach((que)=>{
                var shuffled = arrayshuffle([que.option1,que.option2,que.option3,que.option4]);
                que.option1 = shuffled[0];
                que.option2 = shuffled[1];
                que.option3 = shuffled[2];
                que.option4 = shuffled[3];
                count++;
                if(count==exam.questions.length){
                    res.render('student/exam',{exam:exam,rated:rated});
                }
            });
        }
    });
});

//evaluation route
app.post('/student/exam',loginRequired,isStudent,(req,res)=>{
    var examid = req.body.solution.examid;
    var entries  = Object.keys(req.body.solution).length
    var solution = req.body.solution
    var evaluation = {
        total:0,
        attempt:0,
        correct:0,
        percentage:0
    }
    var analysis = []
    Exam.findById(examid,(err,exam)=>{
        if(err){
            console.log(err)
        }
        else{
            console.log(entries);
            var keys = Object.keys(solution);

            evaluation['attempt']=keys.length-1;
            evaluation['total']=exam.questions.length;

            var all=[]
            for(var k=0;k<exam.questions.length;k++){
                all[k]=k+1;
            }
            for(var i = 1; i<entries;i++){
                var keys = Object.keys( solution );
                var qn = keys[i].substring(8,9);
                var question = exam.questions[qn-1];
                
                if(solution['question'+qn]==question.option1){
                    evaluation['correct']++;
                    all[qn-1]=0;
                }
                else{
                    all[qn-1]=0;
                    analysis.push({
                        statement: question.statement,
                        ans: question.option1,
                        selected: solution['question'+qn]
                    });
                }
            }
            for(var l = 0; l<all.length;l++){
                if(all[l]!=0){
                    analysis.push({
                        statement: exam.questions[l].statement,
                        ans: exam.questions[l].option1,
                        selected: '-NA-'
                    });
                }
            }
            console.log(all);
            evaluation['percentage']=Math.round((evaluation['correct']/evaluation['total'])*100)

            //rating stuff
             let rated = false;
            exam.ratings.forEach(function(rating){
                if(rating.userid==req.user.id){
                    rated=true;
                }
            })
            if(!rated){
                console.log('rated')
                let rate = new Rating({
                    userid: req.user.id,
                    rating: req.body.rating
                });
                rate.save((err,rating)=>{
                    if(err){
                        console.log(err);
                    }
                    else{
                        if(req.body.rating!=0){
                            exam.ratings.push(rating);
                            exam.raters++;
                            exam.avgrating = (exam.avgrating + rating.rating)/exam.raters;
                        }
                        exam.save((err,exam)=>{
                            if(err){
                                console.log(err);
                            }else{
                                console.log('rating added to ' + exam);
                            }
                        })
                    }
                })
            }
                
            
            res.render('student/eval',{evaluation:evaluation,analysis:analysis,exam:exam});
        }
    })

})


// ===============================================
//                All Route
// ===============================================

app.get('*',function(req,res){
    res.redirect('/');
});

// ===============================================
//                LISTEN
// ===============================================

app.listen(process.env.PORT,function(){
    console.log('listening on port ' + process.env.PORT);
});