const path=require('path');
const express=require('express');
const cors=require('cors');
const {query}=require('./config/database');
const authRoutes=require('./modules/auth/auth.routes');
const usuarioRoutes=require('./modules/usuarios/usuario.routes');
const atividadesRoutes=require('./modules/atividades/atividades.routes');
const osRoutes=require('./modules/os/os.routes');
const moduloRoutes=require('./modules/modulos/modulo.routes');
const almoxarifadoRoutes=require('./modules/almoxarifado/almoxarifado.routes');

const app=express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'..','public')));
app.use('/uploads',express.static(path.join(__dirname,'..','uploads')));

app.get('/api/health',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,database:'connected'});}catch(err){res.status(500).json({ok:false,error:err.message});}});
app.use('/api',authRoutes);
app.use('/api',moduloRoutes);
app.use('/api/usuarios',usuarioRoutes);
app.use('/api/almoxarifado',almoxarifadoRoutes);
app.use('/',atividadesRoutes);
app.use('/',osRoutes);
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
module.exports=app;
