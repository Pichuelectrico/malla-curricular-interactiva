-- Seed initial admin (bootstrap)
INSERT INTO public.admin_profiles (email, name)
VALUES ('joshreino@usfq.edu.ec', 'Joshua Reinoso')
ON CONFLICT (email) DO NOTHING;
