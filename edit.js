'use strict';
(function(){
  if(!document.getElementById('editForm'))return;
  let editing=null,keptUrls=[],newBlobs=[],newPreviews=[],removedUrls=[];

  function totalPhotos(){return keptUrls.length+newBlobs.length}

  function renderEditPhotos(){
    const kept=keptUrls.map(function(u,i){
      return '<div class="pv"><img src="'+escapeHTML(u)+'" alt="Photo '+(i+1)+'"><button type="button" data-action="edit-remove" data-kind="kept" data-index="'+i+'" aria-label="Retirer cette photo">×</button></div>';
    });
    const added=newPreviews.map(function(u,i){
      return '<div class="pv"><img src="'+escapeHTML(u)+'" alt="Nouvelle photo '+(i+1)+'"><button type="button" data-action="edit-remove" data-kind="new" data-index="'+i+'" aria-label="Retirer cette photo">×</button></div>';
    });
    $('editPhotoGrid').innerHTML=kept.concat(added).join('')||'<p class="muted">Aucune photo.</p>';
  }
  function clearNewPreviews(){
    newPreviews.forEach(function(u){URL.revokeObjectURL(u)});
    newBlobs=[];newPreviews=[];
  }
  function openEdit(id){
    const p=myProducts.find(function(x){return String(x.id)===String(id)});
    if(!p)return;
    editing=p;keptUrls=productImages(p).slice();removedUrls=[];clearNewPreviews();
    $('editName').value=p.name||'';
    $('editPrice').value=p.price;
    $('editDescription').value=p.description||'';
    $('editCategory').value=p.category||'';
    renderEditPhotos();
    $('editPanel').classList.remove('hidden');
    $('editPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function closeEdit(){
    editing=null;keptUrls=[];removedUrls=[];clearNewPreviews();
    $('editPhotoGrid').innerHTML='';
    $('editPanel').classList.add('hidden');
  }

  $('editPhotoInput').addEventListener('change',async function(){
    const input=this;
    const files=Array.prototype.slice.call(input.files||[]);
    input.value='';
    if(!files.length)return;
    const room=MAX_PHOTOS-totalPhotos();
    if(room<=0){alert('Maximum '+MAX_PHOTOS+' photos par produit. Retire une photo pour en ajouter une autre.');return}
    if(files.length>room)alert('Maximum '+MAX_PHOTOS+' photos par produit : seules '+room+' photo(s) sont ajoutée(s).');
    const button=$('editSubmit');
    setBusy(button,true);
    try{
      for(const file of files.slice(0,room)){
        if(!file.type||file.type.indexOf('image/')!==0){alert('Un fichier n’est pas une image : il est ignoré.');continue}
        try{
          const blob=await compressImage(file,800,0.72);
          newBlobs.push(blob);
          newPreviews.push(URL.createObjectURL(blob));
        }catch(err){alert('Une photo n’a pas pu être lue : elle est ignorée.')}
      }
    }finally{setBusy(button,false);renderEditPhotos()}
  });

  $('editForm').addEventListener('submit',async function(e){
    e.preventDefault();
    if(!editing||!requireDb()||!currentUser)return;
    const button=$('editSubmit');
    const name=$('editName').value.trim(),price=Number($('editPrice').value);
    if(!name||!Number.isFinite(price)||price<0){alert('Vérifie le nom et le prix.');return}
    setBusy(button,true);
    const uploaded=[];
    try{
      const urls=keptUrls.slice();
      for(let i=0;i<newBlobs.length;i++){
        const path=currentUser.id+'/'+Date.now()+'-e'+i+'.jpg';
        const up=await db.storage.from(BUCKET).upload(path,newBlobs[i],{contentType:'image/jpeg',cacheControl:'31536000'});
        if(up.error)throw up.error;
        uploaded.push(path);
        urls.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }
      const res=await db.from('products').update({
        name:name,price:price,
        description:$('editDescription').value.trim(),
        category:$('editCategory').value.trim(),
        image_url:urls[0]||'',
        images:urls
      }).eq('id',editing.id).select().single();
      if(res.error)throw res.error;
      uploaded.length=0;
      const paths=removedUrls.map(storagePath).filter(Boolean);
      if(paths.length){try{await db.storage.from(BUCKET).remove(paths)}catch(x){}}
      const idx=myProducts.findIndex(function(x){return x.id===editing.id});
      if(idx>-1)myProducts[idx]=res.data;
      closeEdit();
      renderMyProducts();renderPreview();
      alert('Produit modifié !');
    }catch(err){
      if(uploaded.length){try{await db.storage.from(BUCKET).remove(uploaded)}catch(x){}}
      alert(friendlyError(err));
    }finally{setBusy(button,false)}
  });

  document.addEventListener('click',function(e){
    const el=e.target.closest('[data-action]');
    if(!el)return;
    const a=el.dataset.action;
    if(a==='edit-product')openEdit(el.dataset.id);
    else if(a==='cancel-edit')closeEdit();
    else if(a==='edit-remove'){
      const i=Number(el.dataset.index);
      if(el.dataset.kind==='kept'){
        if(i>=0&&i<keptUrls.length){removedUrls.push(keptUrls[i]);keptUrls.splice(i,1)}
      }else if(i>=0&&i<newBlobs.length){
        URL.revokeObjectURL(newPreviews[i]);
        newBlobs.splice(i,1);newPreviews.splice(i,1);
      }
      renderEditPhotos();
    }
  });

  window.renderMyProducts=function(){
    const list=$('productList');
    if(!myProducts.length){list.innerHTML='<div class="panel muted">Tu n’as pas encore ajouté de produit.</div>';return}
    const cur=myStore?myStore.currency:'FCFA';
    list.innerHTML=myProducts.map(function(p){
      const imgs=productImages(p);
      const count=imgs.length>1?'<p>📷 '+imgs.length+' photos</p>':'';
      return '<article class="product"><img src="'+escapeHTML(imgs[0]||'https://placehold.co/150x150?text=Produit')+'" alt="">'
        +'<div><h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(formatPrice(p.price,cur))+'</p><p>'+escapeHTML(p.description||'')+'</p>'+count+'</div>'
        +'<div class="tools" style="display:flex;gap:6px;flex-wrap:wrap"><button class="secondary small" data-action="edit-product" data-id="'+escapeHTML(p.id)+'">Modifier</button><button class="danger small" data-action="delete-product" data-id="'+escapeHTML(p.id)+'">Supprimer</button></div></article>';
    }).join('');
  };
})();
