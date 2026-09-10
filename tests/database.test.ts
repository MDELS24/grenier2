import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { currentLocation, due, searchCrates, type Crate } from '../lib/crates.ts';
test('Postgres: inventory, movements, conflicts and access control', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key);
 insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 `);
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202609100001_grenier2.sql', import.meta.url),
        'utf8',
      ),
    );
    const identity = async (email: string, id = '11111111-1111-4111-8111-111111111111') => {
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: id, email }),
      ]);
    };
    const mutate = async (operation: string, payload: unknown) => {
      const r = await db.query<{ result: Crate }>(
        'select public.mutate_crate($1,$2::jsonb) as result',
        [operation, JSON.stringify(payload)],
      );
      return r.rows[0].result;
    };
    await identity('lienmathieu2@gmail.com');
    await db.exec('set role authenticated');
    let row = await mutate('POST', {
      name: 'Rouleaux 3D',
      location: 'Grenier A',
      category: 'Équipement',
      items: 'PLA blanc\nPLA noir',
      notes: '',
    });
    assert.equal(currentLocation(row), 'Grenier A');
    assert.equal(row.revision, 0);
    const original = row;
    row = await mutate('PATCH', {
      id: row.id,
      revision: row.revision,
      action: 'move',
      destination: 'Bureau',
      return_date: '2026-09-17',
      move_note: 'Projet 3D',
    });
    assert.equal(row.location, 'Grenier A');
    assert.equal(currentLocation(row), 'Bureau');
    assert.equal(due(row, '2026-09-18'), true);
    assert.equal(searchCrates([row], 'bureau').length, 1);
    assert.equal(searchCrates([row], 'grenier a').length, 1);
    await assert.rejects(mutate('PUT', original), /autre appareil/);
    await assert.rejects(mutate('DELETE', original), /autre appareil/);
    await assert.rejects(mutate('PUT', { ...row, location: 'Bureau' }), /retour/);
    await assert.rejects(
      mutate('PATCH', {
        id: row.id,
        revision: row.revision,
        action: 'move',
        destination: 'Bureau',
        return_date: '2026-02-30',
        move_note: '',
      }),
    );
    const movedAt = row.moved_at;
    row = await mutate('PATCH', {
      id: row.id,
      revision: row.revision,
      action: 'move',
      destination: 'Étagère B',
      return_date: null,
      move_note: '',
    });
    assert.equal(row.moved_at, movedAt);
    assert.equal(row.return_date, null);
    assert.equal(row.location, 'Grenier A');
    row = await mutate('PATCH', { id: row.id, revision: row.revision, action: 'return' });
    assert.equal(currentLocation(row), 'Grenier A');
    assert.equal(row.moved_at, null);
    assert.equal(row.move_note, '');
    await assert.rejects(
      mutate('PATCH', { id: row.id, revision: row.revision, action: 'return' }),
      /déjà/,
    );
    await assert.rejects(
      db.query('update public.boxes set notes=$1', ['bypass']),
      /permission denied/,
    );
    await identity('another@example.com');
    assert.equal((await db.query('select * from public.boxes')).rows.length, 0);
    await assert.rejects(mutate('PUT', row), /non autorisé/);
    await identity('lienmathieu2@gmail.com', '22222222-2222-4222-8222-222222222222');
    assert.equal((await db.query('select * from public.boxes')).rows.length, 0);
    await assert.rejects(mutate('DELETE', row), /n’existe plus/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.boxes'), /permission denied/);
    await assert.rejects(mutate('POST', {}), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await identity('lienmathieu2@gmail.com');
    await mutate('DELETE', row);
    assert.equal((await db.query('select * from public.boxes')).rows.length, 0);
  } finally {
    await db.close();
  }
});
