-- Включаем RLS на таблицах досок (boards, board_members, board_lists).
-- Политики были созданы в 20260411_*, но само RLS никогда не включалось —
-- защиты по факту не было: любой авторизованный пользователь мог читать/писать
-- чужие доски. Миграция устраняет дыру.

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_lists ENABLE ROW LEVEL SECURITY;
