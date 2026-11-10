import { InlineKeyboard, type Bot, type Context } from 'grammy';
import { isAdmin } from '../config.js';
import { db } from '../db.js';
import { escapeHtml, formatPrice } from '../format.js';

type State = 'name'|'category'|'brand'|'model'|'photos'|'description'|'specs'|'price'|'stock'|'status'|'edit';
type Session = { state: State; payload: Record<string, unknown> };
const money = (n: number, c = 'RUB') => formatPrice(n, c);
const menu = () => new InlineKeyboard().text('📦 Каталог', 'admin:products').text('➕ Добавить', 'admin:add').row().text('⬅️ Меню', 'admin:home');
const productActions = (id: string) => new InlineKeyboard()
  .text('✏️ Изменить', 'admin:edit:' + id).text('📦 Архивировать', 'admin:archive:' + id).row()
  .text('🗑 Удалить', 'admin:delete:' + id).row().text('⬅️ К каталогу', 'admin:products');

async function session(id: number): Promise<Session | null> {
  const { data, error } = await db.from('admin_sessions').select('state,payload').eq('telegram_user_id', id).maybeSingle();
  if (error) throw error;
  return data ? { state: data.state as State, payload: data.payload ?? {} } : null;
}
async function putSession(id: number, s: Session) {
  const { error } = await db.from('admin_sessions').upsert({ telegram_user_id:id, state:s.state, payload:s.payload, updated_at:new Date().toISOString() }, { onConflict:'telegram_user_id' });
  if (error) throw error;
}
async function clearSession(id: number) {
  const { error } = await db.from('admin_sessions').delete().eq('telegram_user_id', id);
  if (error) throw error;
}
async function log(id:number, action:string, productId:string|null, details:Record<string,unknown>={}) {
  const { error } = await db.from('admin_activity_logs').insert({ administrator_id:id, action, entity_type:'product', entity_id:productId, details });
  if (error) throw error;
}
async function listProducts(ctx:Context) {
  const { data, error } = await db.from('products').select('id,name,price,currency,status,stock_quantity').neq('status','archived').order('created_at',{ascending:false}).limit(20);
  if (error) return void await ctx.reply('Ошибка загрузки каталога. Проверьте подключение Supabase.');
  if (!data?.length) return void await ctx.reply('Каталог пуст. Добавьте первый товар.',{reply_markup:menu()});
  const kb = new InlineKeyboard();
  for (const p of data) kb.text((p.status==='active'?'🟢':'⚪')+' '+String(p.name).slice(0,35)+' · '+money(Number(p.price),p.currency), 'admin:product:'+p.id).row();
  kb.text('➕ Добавить товар','admin:add').row().text('⬅️ Меню','admin:home');
  await ctx.reply('📦 <b>Каталог MJL</b>\nПоказаны последние '+data.length+' товаров.',{parse_mode:'HTML',reply_markup:kb});
}
async function showProduct(ctx:Context,id:string) {
  const { data:p,error } = await db.from('products').select('*').eq('id',id).maybeSingle();
  if (error || !p) return void await ctx.reply('Товар не найден.');
  const cat = p.category_id ? await db.from('categories').select('name,emoji').eq('id',p.category_id).maybeSingle() : {data:null};
  const specs = Object.entries(p.specifications ?? {}).map(([k,v])=>'• '+escapeHtml(k)+': '+escapeHtml(String(v))).join('\n');
  const text = [
    '📦 <b>'+escapeHtml(p.name)+'</b>',
    'ID: <code>'+p.id+'</code>',
    'Категория: '+escapeHtml(cat.data ? ((cat.data.emoji??'')+' '+cat.data.name) : '—'),
    'Бренд / модель: '+escapeHtml([p.brand,p.model].filter(Boolean).join(' / ') || '—'),
    'Цена: '+money(Number(p.price),p.currency),
    'Остаток: '+p.stock_quantity,
    'Статус: '+p.status,
    p.description ? '\n'+escapeHtml(p.description) : '',
    specs ? '\n<b>Характеристики</b>\n'+specs : '',
    '\nФото: '+(p.photo_file_ids?.length ?? 0)
  ].join('\n');
  await ctx.reply(text,{parse_mode:'HTML',reply_markup:productActions(id)});
}
function productPreview(p:Record<string,unknown>) {
  const specs = Object.entries((p.specifications??{}) as Record<string,string>).map(([k,v])=>'• '+escapeHtml(k)+': '+escapeHtml(v)).join('\n');
  return ['🆕 <b>Предпросмотр товара</b>','<b>'+escapeHtml(String(p.name??''))+'</b>',
    [p.brand,p.model].filter(Boolean).map(String).map(escapeHtml).join(' · '),
    p.description ? escapeHtml(String(p.description)) : '', specs ? '\n<b>Характеристики</b>\n'+specs : '',
    '\n💰 '+money(Number(p.price)),'📦 Остаток: '+p.stock_quantity,'📷 Фото: '+((p.photo_file_ids as string[]|undefined)?.length??0)
  ].filter(Boolean).join('\n');
}

export function registerProductAdmin(bot:Bot) {
  bot.callbackQuery('admin:home',async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); await ctx.reply('🔐 <b>Панель управления MJL</b>',{parse_mode:'HTML',reply_markup:menu()});
  });
  bot.callbackQuery('admin:products',async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); await listProducts(ctx);
  });
  bot.callbackQuery('admin:add',async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); await putSession(ctx.from.id,{state:'name',payload:{photo_file_ids:[],specifications:{}}});
    await ctx.reply('➕ <b>Добавление товара · 1/9</b>\nВведите название товара. Отмена: /cancel',{parse_mode:'HTML'});
  });
  bot.callbackQuery(/^admin:category:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    const s=await session(ctx.from.id); if(!s||s.state!=='category') return void await ctx.answerCallbackQuery({text:'Сессия истекла',show_alert:true});
    s.payload.category_id=ctx.match[1]!; s.state='brand'; await putSession(ctx.from.id,s); await ctx.answerCallbackQuery();
    await ctx.reply('Укажите производителя (или «-», если неизвестен).');
  });
  bot.callbackQuery(/^admin:status:(draft|active|out_of_stock|preorder)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    const s=await session(ctx.from.id); if(!s||s.state!=='status') return void await ctx.answerCallbackQuery({text:'Сессия истекла',show_alert:true});
    s.payload.status=ctx.match[1]!; s.state='edit'; s.payload.confirm_create=true; await putSession(ctx.from.id,s); await ctx.answerCallbackQuery();
    await ctx.reply(productPreview(s.payload),{parse_mode:'HTML',reply_markup:new InlineKeyboard().text('💾 Сохранить черновик','admin:save:draft').text('✅ Сохранить','admin:save:chosen').row().text('❌ Отмена','admin:cancel')});
  });
  bot.callbackQuery(/^admin:save:(draft|chosen)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    const s=await session(ctx.from.id); if(!s||!s.payload.confirm_create) return void await ctx.answerCallbackQuery({text:'Предпросмотр устарел',show_alert:true});
    const p=s.payload; const requested=ctx.match[1] === 'draft' ? 'draft' : String(p.status);
    const status=requested==='draft'?'draft':requested==='preorder'?'preorder':requested==='out_of_stock'||Number(p.stock_quantity)===0?'out_of_stock':'active';
    const {data,error}=await db.from('products').insert({
      name:String(p.name),category_id:p.category_id??null,brand:p.brand??null,model:p.model??null,
      photo_file_ids:p.photo_file_ids??[],description:p.description??null,specifications:p.specifications??{},
      price:Number(p.price),currency:'RUB',stock_quantity:Number(p.stock_quantity),status
    }).select('id,name').single();
    if(error){await ctx.answerCallbackQuery({text:'Ошибка сохранения',show_alert:true});return void await ctx.reply('Не удалось сохранить товар: '+escapeHtml(error.message),{parse_mode:'HTML'});}
    await log(ctx.from.id,'product.created',data.id,{name:data.name,status}); await clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({text:'Сохранено'}); await ctx.reply('✅ Товар сохранён: <b>'+escapeHtml(data.name)+'</b>\nID: <code>'+data.id+'</code>',{parse_mode:'HTML',reply_markup:productActions(data.id)});
  });
  bot.callbackQuery(/^admin:product:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); await showProduct(ctx,ctx.match[1]!);
  });
  bot.callbackQuery(/^admin:archive:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    const id=ctx.match[1]!; const {error}=await db.from('products').update({status:'archived',updated_at:new Date().toISOString()}).eq('id',id);
    if(error) return void await ctx.answerCallbackQuery({text:'Не удалось архивировать',show_alert:true});
    await log(ctx.from.id,'product.archived',id); await ctx.answerCallbackQuery({text:'В архиве'}); await ctx.reply('📦 Товар архивирован.');
  });
  bot.callbackQuery(/^admin:delete:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); const id=ctx.match[1]!;
    await ctx.reply('⚠️ <b>Окончательно удалить товар?</b>\nСвязанные заказы сохранятся, связь публикаций с товаром будет очищена.',{parse_mode:'HTML',reply_markup:new InlineKeyboard().text('🗑 Подтвердить','admin:delete-confirm:'+id).text('Отмена','admin:product:'+id)});
  });
  bot.callbackQuery(/^admin:delete-confirm:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    const id=ctx.match[1]!; const {data:p}=await db.from('products').select('id,name').eq('id',id).maybeSingle();
    if(!p) return void await ctx.answerCallbackQuery({text:'Товар уже отсутствует',show_alert:true});
    await log(ctx.from.id,'product.deleted',id,{name:p.name});
    const {error}=await db.from('products').delete().eq('id',id);
    if(error) return void await ctx.answerCallbackQuery({text:'Ошибка удаления',show_alert:true});
    await ctx.answerCallbackQuery({text:'Удалено'}); await ctx.reply('🗑 Товар удалён.');
  });
  bot.callbackQuery(/^admin:edit:(.+)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); const id=ctx.match[1]!;
    const kb=new InlineKeyboard().text('Название','admin:editfield:'+id+':name').text('Бренд','admin:editfield:'+id+':brand').row()
      .text('Модель','admin:editfield:'+id+':model').text('Цена','admin:editfield:'+id+':price').row()
      .text('Описание','admin:editfield:'+id+':description').text('Остаток','admin:editfield:'+id+':stock_quantity').row()
      .text('Статус','admin:editfield:'+id+':status').row().text('⬅️ Назад','admin:product:'+id);
    await ctx.reply('Какое поле изменить?',{reply_markup:kb});
  });
  bot.callbackQuery(/^admin:editfield:([^:]+):(name|brand|model|price|description|stock_quantity|status)$/,async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await ctx.answerCallbackQuery(); const id=ctx.match[1]!,field=ctx.match[2]!;
    await putSession(ctx.from.id,{state:'edit',payload:{product_id:id,field}});
    const labels:Record<string,string>={name:'Новое название:',brand:'Новый бренд (или -):',model:'Новая модель (или -):',price:'Новая цена в RUB:',description:'Новое описание (или -):',stock_quantity:'Новое целое количество:',status:'Статус: draft, active, out_of_stock, archived или preorder:'};
    await ctx.reply(labels[field]??'Новое значение:');
  });
  bot.callbackQuery('admin:cancel',async ctx=>{
    if(!isAdmin(ctx.from.id)) return void await ctx.answerCallbackQuery({text:'Доступ запрещён',show_alert:true});
    await clearSession(ctx.from.id); await ctx.answerCallbackQuery({text:'Отменено'}); await ctx.reply('Операция отменена.',{reply_markup:menu()});
  });
  bot.command('cancel',async ctx=>{
    const userId = ctx.from?.id;
    if (userId === undefined || !isAdmin(userId)) return;
    await clearSession(userId); await ctx.reply('Сценарий отменён.',{reply_markup:menu()});
  });
  bot.on('message:photo',async ctx=>{
    if(!ctx.from || !isAdmin(ctx.from.id)) return;
    const s=await session(ctx.from.id); if(!s||s.state!=='photos') return;
    const ids=(s.payload.photo_file_ids as string[]|undefined)??[]; if(ids.length>=10) return void await ctx.reply('Можно добавить не более 10 фото.');
    ids.push(ctx.message.photo.at(-1)!.file_id); s.payload.photo_file_ids=ids; await putSession(ctx.from.id,s);
    await ctx.reply('Фото добавлено ('+ids.length+'/10). Отправьте ещё фото или напишите «Готово».');
  });
  bot.on('message:text',async ctx=>{
    if(!ctx.from || !isAdmin(ctx.from.id)) return;
    const s=await session(ctx.from.id); if(!s) return;
    const value=ctx.message.text.trim(); if(value.startsWith('/')) return;
    if(s.state==='edit'&&!s.payload.confirm_create){
      const id=String(s.payload.product_id),field=String(s.payload.field); let update:Record<string,unknown>={updated_at:new Date().toISOString()};
      if(field==='price'){const n=Number(value.replace(',','.'));if(!Number.isFinite(n)||n<0)return void await ctx.reply('Введите цену числом ≥ 0.');update.price=n;}
      else if(field==='stock_quantity'){const n=Number(value);if(!Number.isInteger(n)||n<0)return void await ctx.reply('Введите целое число ≥ 0.');update.stock_quantity=n;}
      else if(field==='status'){if(!['draft','active','out_of_stock','archived','preorder'].includes(value))return void await ctx.reply('Недопустимый статус.');update.status=value;}
      else update[field]=value==='-'?null:value;
      const {error}=await db.from('products').update(update).eq('id',id);if(error)return void await ctx.reply('Ошибка обновления товара.');
      await log(ctx.from.id,'product.updated.'+field,id,{field});await clearSession(ctx.from.id);await ctx.reply('✅ Изменения сохранены.');await showProduct(ctx,id);return;
    }
    switch(s.state){
      case 'name':
        if(value.length<2||value.length>120)return void await ctx.reply('Название: от 2 до 120 символов.');
        s.payload.name=value;s.state='category';await putSession(ctx.from.id,s);
        {const {data,error}=await db.from('categories').select('id,name,emoji').eq('is_active',true).order('sort_order');
        if(error||!data?.length)return void await ctx.reply('Категории не найдены. Проверьте миграцию Supabase.');
        const kb=new InlineKeyboard();for(const c of data)kb.text((c.emoji??'📁')+' '+c.name,'admin:category:'+c.id).row();
        await ctx.reply('Выберите категорию:',{reply_markup:kb});}return;
      case 'brand':s.payload.brand=value==='-'?null:value;s.state='model';await ctx.reply('Укажите модель (или -).');break;
      case 'model':s.payload.model=value==='-'?null:value;s.state='photos';await ctx.reply('Отправьте до 10 фото. После отправки напишите «Готово»; если фото нет — «-».');break;
      case 'photos':if(value.toLowerCase()!=='готово'&&value!=='-')return void await ctx.reply('Отправьте фото или «Готово».');s.state='description';await ctx.reply('Описание товара (или -):');break;
      case 'description':s.payload.description=value==='-'?null:value;s.state='specs';await ctx.reply('Характеристики построчно: Параметр: значение. Или -:');break;
      case 'specs':{const specs:Record<string,string>={};if(value!=='-')for(const line of value.split('\n')){const i=line.indexOf(':');if(i>0)specs[line.slice(0,i).trim()]=line.slice(i+1).trim();}s.payload.specifications=specs;s.state='price';await ctx.reply('Цена в рублях:');break;}
      case 'price':{const n=Number(value.replace(',','.'));if(!Number.isFinite(n)||n<0)return void await ctx.reply('Введите корректную цену.');s.payload.price=n;s.state='stock';await ctx.reply('Количество на складе (целое число ≥ 0):');break;}
      case 'stock':{const n=Number(value);if(!Number.isInteger(n)||n<0)return void await ctx.reply('Введите целое число ≥ 0.');s.payload.stock_quantity=n;s.state='status';await putSession(ctx.from.id,s);
        await ctx.reply('Выберите статус:',{reply_markup:new InlineKeyboard().text('Черновик','admin:status:draft').text('В наличии','admin:status:active').row().text('Предзаказ','admin:status:preorder').text('Нет в наличии','admin:status:out_of_stock')});return;}
      default:return;
    }
    await putSession(ctx.from.id,s);
  });
}
