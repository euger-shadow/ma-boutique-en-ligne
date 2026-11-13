'use strict';
const SUPABASE_URL='https://xnsbfjvqjzjuacszglrq.supabase.co';
const SUPABASE_KEY='sb_publishable_RPo64LDZ2HNmg4WIxulcVw_0708uRCO';
const BUCKET='product-photos';
const PAGES=['homePage','authPage','dashboardPage','publicPage','storePage'];
let db=null,currentUser=null,myStore=null,myProducts=[],viewedStore=null,viewedProducts=[];
let ctx={store:null,products:[]},authMode='register',pendingPhoto=null,previewUrl='';
const $=id=>document.getElementById(id);

/* ---------- Utilitaires ---------- */
function escapeHTML(value){return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function formatPrice(price,currency){return Number(price).toLocaleString('fr-FR')+' '+(currency||'FCFA')}
function safeImage(url,fallback){return typeof url==='string'&&url.indexOf('https://')===0?url:fallback}
function slugify(text){return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'boutique'}
function randomSuffix(){return Math.random().toString(36).slice(2,6)}
function storeLink(s){return location.origin+location.pathname+'?b='+encodeURIComponent(s.slug)}
function setBusy(button,busy){if(button)button.disabled=busy}
function friendlyError(err){
  const m=String(err&&err.message?err.message:err||'');
  if(/invalid login credentials/i.test(m))return 'E-mail ou mot de passe incorrect.';
  if(/already registered|already been registered/i.test(m))return 'Cette adresse e-mail existe déjà. Connecte-toi.';
  if(/at least 6|password should/i.test(m))return 'Le mot de passe doit contenir au moins 6 caractères.';
  if(/rate limit/i.test(m))return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if(/failed to fetch|network/i.test(m))return 'Connexion impossible. Vérifie ta connexion Internet.';
  if(/duplicate key/i.test(m))return 'Ce nom est déjà utilisé. Essaie une autre variante.';
  return 'Une erreur est survenue : '+m;
}
function requireDb(){
  if(db)return true;
  alert("Le service en ligne n'est pas disponible. Vérifie ta connexion et recharge la page.");
  return false;
}

/* ---------- Navigation ---------- */
function showPage(id){PAGES.forEach(p=>$(p).classList.add('hidden'));$(id).classList.remove('hidden');window.scrollTo(0,0)}
function goHome(){history.replaceState(null,'',location.pathname);showPage('homePage')}
function openSpace(){if(currentUser)showDashboard();else openAuth('login')}
function startSelling(){if(currentUser)showDashboard();else openAuth('register')}
function openTab(name,button){
  document.querySelectorAll('.tabPanel').forEach(p=>p.classList.add('hidden'));
  $(name+'Tab').classList.remove('hidden');
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
  if(button)button.classList.add('active');
  if(name==='preview')renderPreview();
}

/* ---------- Connexion / inscription ---------- */
function openAuth(mode){
  authMode=mode;showPage('authPage');
  const login=mode==='login';
  $('authTitle').textContent=login?'Connexion vendeur':'Créer un compte vendeur';
  $('authIntro').textContent=login?'Connecte-toi à ton espace.':'Ouvre ton espace pour créer ta boutique.';
  $('authSubmit').textContent=login?'Me connecter':'Créer mon compte';
  $('nameField').classList.toggle('hidden',login);
  $('fullName').required=!login;
  $('password').autocomplete=login?'current-password':'new-password';
  $('authSwitch').innerHTML=login?'Pas encore de compte ? <a href="#" id="switchAuth">Créer un compte</a>':'Tu as déjà un compte ? <a href="#" id="switchAuth">Se connecter</a>';
  $('switchAuth').onclick=function(e){e.preventDefault();openAuth(login?'register':'login')};
}
$('authForm').addEventListener('submit',async function(e){
  e.preventDefault();
  if(!requireDb())return;
  const form=this,button=$('authSubmit');
  const email=$('email').value.trim().toLowerCase(),password=$('password').value;
  setBusy(button,true);
  try{
    if(authMode==='register'){
      const name=$('fullName').value.trim();
      if(!name){alert('Indique ton nom.');return}
      const res=await db.auth.signUp({email:email,password:password,options:{data:{name:name}}});
      if(res.error)throw res.error;
      if(!res.data.session){alert('Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.');openAuth('login');return}
      currentUser=res.data.user;
      alert('Compte créé ! Configure maintenant ta boutique.');
    }else{
      const res=await db.auth.signInWithPassword({email:email,password:password});
      if(res.error)throw res.error;
      currentUser=res.data.user;
    }
    form.reset();
    await showDashboard();
  }catch(err){alert(friendlyError(err))}
  finally{setBusy(button,false)}
});
async function logout(){
  if(db)await db.auth.signOut();
  currentUser=null;myStore=null;myProducts=[];
  goHome();
}

/* ---------- Espace vendeur ---------- */
async function showDashboard(){
  if(!currentUser){openAuth('login');return}
  showPage('dashboardPage');
  const meta=currentUser.user_metadata||{};
  $('welcomeText').textContent='Bienvenue, '+(meta.name||currentUser.email)+' !';
  await loadMyStore();
  fillStoreForm();renderMyProducts();renderPreview();
  openTab('settings',document.querySelector('[data-tab="settings"]'));
}
async function loadMyStore(){
  myStore=null;myProducts=[];
  const res=await db.from('stores').select('*').eq('owner_id',currentUser.id).maybeSingle();
  if(res.error){alert(friendlyError(res.error));return}
  myStore=res.data;
  if(!myStore)return;
  const pr=await db.from('products').select('*').eq('store_id',myStore.id).order('created_at',{ascending:false});
  if(pr.error)alert(friendlyError(pr.error));else myProducts=pr.data||[];
}
function fillStoreForm(){
  const s=myStore||{};
  $('storeName').value=s.name||'';
  $('storeDescription').value=s.description||'';
  $('storeCategory').value=s.category||'Mode et accessoires';
  $('storeCountry').value=s.country||"Côte d'Ivoire";
  $('storeCity').value=s.city||'';
  $('currency').value=s.currency||'FCFA';
  $('whatsapp').value=s.whatsapp||'';
}
$('storeForm').addEventListener('submit',async function(e){
  e.preventDefault();
  if(!requireDb()||!currentUser)return;
  const button=$('storeSubmit');
  const payload={
    name:$('storeName').value.trim(),
    description:$('storeDescription').value.trim(),
    category:$('storeCategory').value,
    country:$('storeCountry').value,
    city:$('storeCity').value.trim(),
    currency:$('currency').value,
    whatsapp:$('whatsapp').value.replace(/[^0-9]/g,'')
  };
  if(!payload.name){alert('Donne un nom à ta boutique.');return}
  setBusy(button,true);
  try{
    let res;
    if(myStore){
      res=await db.from('stores').update(payload).eq('id',myStore.id).select().single();
    }else{
      payload.slug=slugify(payload.name)+'-'+randomSuffix();
      res=await db.from('stores').insert(payload).select().single();
    }
    if(res.error)throw res.error;
    myStore=res.data;
    renderPreview();renderMyProducts();
    alert('Boutique enregistrée !');
  }catch(err){alert(friendlyError(err))}
  finally{setBusy(button,false)}
});
