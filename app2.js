'use strict';

/* ---------- Produits ---------- */
function compressImage(file,maxSize,quality){
  return new Promise(function(resolve,reject){
    const reader=new FileReader();
    reader.onerror=function(){reject(new Error('lecture'))};
    reader.onload=function(){
      const img=new Image();
      img.onerror=function(){reject(new Error('image'))};
      img.onload=function(){
        const ratio=Math.min(1,maxSize/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*ratio)),h=Math.max(1,Math.round(img.height*ratio));
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        const c=canvas.getContext('2d');
        c.fillStyle='#ffffff';c.fillRect(0,0,w,h);c.drawImage(img,0,0,w,h);
        canvas.toBlob(function(b){b?resolve(b):reject(new Error('blob'))},'image/jpeg',quality);
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function resetPhoto(){
  pendingPhoto=null;
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}
  const prev=$('photoPreview');prev.removeAttribute('src');prev.classList.add('hidden');
}
$('productPhoto').addEventListener('change',async function(){
  resetPhoto();
  const file=this.files&&this.files[0];
  if(!file)return;
  if(!file.type||file.type.indexOf('image/')!==0){alert('Choisis un fichier image.');this.value='';return}
  try{
    pendingPhoto=await compressImage(file,800,0.72);
    previewUrl=URL.createObjectURL(pendingPhoto);
    const prev=$('photoPreview');prev.src=previewUrl;prev.classList.remove('hidden');
  }catch(err){alert('Impossible de lire cette photo. Essaie une autre image.');this.value='';resetPhoto()}
});
$('productForm').addEventListener('submit',async function(e){
  e.preventDefault();
  if(!requireDb()||!currentUser)return;
  if(!myStore){alert("Enregistre d'abord les informations de ta boutique.");openTab('settings',document.querySelector('[data-tab="settings"]'));return}
  const form=this,button=$('productSubmit');
  const name=$('productName').value.trim(),price=Number($('productPrice').value);
  if(!name||!Number.isFinite(price)||price<0){alert('Vérifie le nom et le prix.');return}
  setBusy(button,true);
  try{
    let imageUrl='';
    if(pendingPhoto){
      const path=currentUser.id+'/'+Date.now()+'.jpg';
      const up=await db.storage.from(BUCKET).upload(path,pendingPhoto,{contentType:'image/jpeg',cacheControl:'31536000'});
      if(up.error)throw up.error;
      imageUrl=db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const res=await db.from('products').insert({
      store_id:myStore.id,name:name,price:price,
      description:$('productDescription').value.trim(),
      category:$('productCategory').value.trim(),
      image_url:imageUrl
    }).select().single();
    if(res.error)throw res.error;
    myProducts.unshift(res.data);
    form.reset();resetPhoto();
    renderMyProducts();renderPreview();
    alert('Produit ajouté !');
  }catch(err){alert(friendlyError(err))}
  finally{setBusy(button,false)}
});
function renderMyProducts(){
  const list=$('productList');
  if(!myProducts.length){list.innerHTML='<div class="panel muted">Tu n’as pas encore ajouté de produit.</div>';return}
  const cur=myStore?myStore.currency:'FCFA';
  list.innerHTML=myProducts.map(function(p){
    return '<article class="product"><img src="'+escapeHTML(safeImage(p.image_url,'https://placehold.co/150x150?text=Produit'))+'" alt="">'
      +'<div><h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(formatPrice(p.price,cur))+'</p><p>'+escapeHTML(p.description||'')+'</p></div>'
      +'<div class="tools"><button class="danger small" data-action="delete-product" data-id="'+escapeHTML(p.id)+'">Supprimer</button></div></article>';
  }).join('');
}
async function deleteProduct(id){
  if(!confirm('Veux-tu vraiment supprimer ce produit ?'))return;
  const p=myProducts.find(x=>String(x.id)===String(id));
  if(!p)return;
  try{
    const res=await db.from('products').delete().eq('id',p.id);
    if(res.error)throw res.error;
    const marker='/'+BUCKET+'/';
    if(p.image_url&&p.image_url.indexOf(marker)>-1){
      const path=decodeURIComponent(p.image_url.slice(p.image_url.indexOf(marker)+marker.length));
      await db.storage.from(BUCKET).remove([path]);
    }
    myProducts=myProducts.filter(x=>x.id!==p.id);
    renderMyProducts();renderPreview();
  }catch(err){alert(friendlyError(err))}
}

/* ---------- Vitrine et boutiques publiques ---------- */
function productCards(items,store){
  if(!items.length)return '<p class="muted">Aucun produit pour le moment.</p>';
  return items.map(function(p){
    return '<article class="panel public-product"><img src="'+escapeHTML(safeImage(p.image_url,'https://placehold.co/500x350?text=Produit'))+'" alt="'+escapeHTML(p.name)+'">'
      +'<div class="inside"><h3>'+escapeHTML(p.name)+'</h3><p class="muted">'+escapeHTML(p.description||'')+'</p>'
      +'<p class="price">'+escapeHTML(formatPrice(p.price,store.currency))+'</p>'
      +'<button class="primary" data-action="order" data-id="'+escapeHTML(p.id)+'">Commander sur WhatsApp</button></div></article>';
  }).join('');
}
function renderPreview(){
  const box=$('previewProducts');
  if(!myStore){
    $('previewName').textContent='Ma vitrine';
    $('previewLink').textContent="Enregistre d'abord ta boutique pour obtenir ton lien.";
    box.innerHTML='';return;
  }
  $('previewName').textContent=myStore.name;
  $('previewLink').textContent=storeLink(myStore);
  ctx={store:myStore,products:myProducts};
  box.innerHTML=productCards(myProducts,myStore);
}
function viewMyStore(){
  if(!myStore){alert("Enregistre d'abord ta boutique.");return}
  openStore(myStore.slug);
}
function shareMyStore(){
  if(!myStore){alert("Enregistre d'abord ta boutique.");return}
  shareStore(myStore);
}
function shareStore(s){
  if(!s)return;
  const url=storeLink(s);
  if(navigator.share){navigator.share({title:s.name,text:'Découvre la boutique '+s.name+' sur Velno',url:url}).catch(function(){})}
  else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){alert('Lien copié !')}).catch(function(){prompt('Copie ce lien :',url)})}
  else prompt('Copie ce lien :',url);
}
async function showPublicStores(){
  showPage('publicPage');
  history.replaceState(null,'',location.pathname);
  const box=$('publicDemo');
  if(!requireDb())return;
  box.innerHTML='<div class="panel muted">Chargement…</div>';
  const res=await db.from('stores').select('slug,name,description,city,country,category').order('created_at',{ascending:false}).limit(50);
  if(res.error){box.innerHTML='<div class="panel muted">'+escapeHTML(friendlyError(res.error))+'</div>';return}
  const stores=res.data||[];
  if(!stores.length){box.innerHTML='<div class="panel muted">Aucune boutique pour le moment. Sois la première !</div>';return}
  box.innerHTML=stores.map(function(s){
    return '<article class="panel"><h3>'+escapeHTML(s.name)+'</h3><p class="muted">'+escapeHTML(s.description||'')+'</p><p>'+escapeHTML([s.city,s.country].filter(Boolean).join(', '))+'</p>'
      +'<button class="primary" data-action="open-store" data-slug="'+escapeHTML(s.slug)+'">Voir la boutique</button></article>';
  }).join('');
}
async function openStore(slug){
  if(!requireDb())return;
  showPage('storePage');
  const content=$('storeContent');
  content.innerHTML='<div class="panel muted">Chargement…</div>';
  const res=await db.from('stores').select('*').eq('slug',slug).maybeSingle();
  if(res.error||!res.data){content.innerHTML='<div class="panel muted">Cette boutique est introuvable.</div>';return}
  const pr=await db.from('products').select('*').eq('store_id',res.data.id).order('created_at',{ascending:false});
  viewedStore=res.data;viewedProducts=pr.error?[]:(pr.data||[]);
  ctx={store:viewedStore,products:viewedProducts};
  document.title=viewedStore.name+' - Velno';
  content.innerHTML='<div class="panel store-head"><div><h2 style="margin:0">'+escapeHTML(viewedStore.name)+'</h2>'
    +'<p class="muted" style="margin:6px 0 0">'+escapeHTML(viewedStore.description||'')+'</p>'
    +'<p class="muted" style="margin:6px 0 0">'+escapeHTML([viewedStore.city,viewedStore.country].filter(Boolean).join(', '))+'</p></div>'
    +'<button class="primary" data-action="share-viewed">Partager</button></div>'
    +'<div class="store-grid">'+productCards(viewedProducts,viewedStore)+'</div>';
  history.replaceState(null,'',location.pathname+'?b='+encodeURIComponent(slug));
}
function orderProduct(id){
  const s=ctx.store;if(!s)return;
  const p=ctx.products.find(x=>String(x.id)===String(id));if(!p)return;
  const phone=String(s.whatsapp||'').replace(/[^0-9]/g,'');
  if(!phone){alert("Cette boutique n'a pas encore de numéro WhatsApp.");return}
  const msg='Bonjour, je suis intéressé(e) par '+p.name+' au prix de '+formatPrice(p.price,s.currency)+'. Est-il disponible ?';
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');
}
document.addEventListener('click',function(e){
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const a=el.dataset.action;
  if(a==='open-store')openStore(el.dataset.slug);
  else if(a==='order')orderProduct(el.dataset.id);
  else if(a==='delete-product')deleteProduct(el.dataset.id);
  else if(a==='share-viewed')shareStore(viewedStore);
});

/* ---------- Démarrage ---------- */
async function init(){
  $('year').textContent=new Date().getFullYear();
  if(!window.supabase){alert("Impossible de charger le service en ligne. Vérifie ta connexion et recharge la page.");return}
  db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  try{
    const res=await db.auth.getSession();
    currentUser=res.data&&res.data.session?res.data.session.user:null;
  }catch(err){currentUser=null}
  db.auth.onAuthStateChange(function(event,session){currentUser=session?session.user:null});
  const slug=new URLSearchParams(location.search).get('b');
  if(slug){await openStore(slug);return}
  if(currentUser)await showDashboard();
}
init();
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){})})}
