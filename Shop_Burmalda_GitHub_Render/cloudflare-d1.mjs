export function cloudflareDatabase(account, database, token) {
  if (!/^[a-f0-9]{32}$/i.test(account || '') ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(database || '') || !token) {
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and D1_API_TOKEN.');
  }
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database/' + database + '/query';

  async function execute(body) {
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token},
      body:JSON.stringify(body),
      redirect:'error',
      signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Cloudflare D1 request failed (' + response.status + ').');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.result) || !data.result.length ||
        data.result.some(item => !item.success)) {
      throw new Error('Cloudflare D1 did not execute the SQL request.');
    }
    return data.result;
  }

  return {
    async migrate(statements) {
      await execute({batch:statements.map(sql => ({sql}))});
    },
    prepare(sql) {
      function bind(values) {
        const query = async () => (await execute({sql,params:values.map(String)}))[0];
        const all = async () => ({results:(await query()).results});
        return {
          bind:(...params) => bind(params),
          first:async () => (await all()).results[0] ?? null,
          all,
          run:query
        };
      }
      return bind([]);
    }
  };
}
