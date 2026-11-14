-- SHEIN removida a pedido do produto (não havia dados vinculados).
delete from public.data_sources where id = 'shein';

-- Amazon: conector da Product Advertising API implementado; aguardando as credenciais de Associado.
update public.data_sources
   set status = 'not_configured',
       status_detail = 'Conector implementado (Product Advertising API 5.0). Aguardando Access Key, Secret Key e Partner Tag de uma conta de Associado.',
       updated_at = now()
 where id = 'amazon';

update public.data_sources
   set status_detail = 'A API do TikTok Shop só dá acesso à loja que autorizou o aplicativo; busca de produtos de terceiros depende de aplicativo de afiliado aprovado pelo TikTok.',
       updated_at = now()
 where id = 'tiktokshop';
