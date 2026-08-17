-- supabase_migration_post_likes.sql
-- Create post_likes table to track likes on posts and prevent spam notifications

CREATE TABLE IF NOT EXISTS public.post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'liked' CHECK (status IN ('liked', 'unliked')),
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(post_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- Policies for post_likes
CREATE POLICY "Users can insert their own likes" 
    ON public.post_likes FOR INSERT 
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own likes" 
    ON public.post_likes FOR UPDATE 
    USING (auth.uid()::text = user_id);

CREATE POLICY "Anyone can view likes" 
    ON public.post_likes FOR SELECT 
    USING (true);

-- Allow users to delete their own likes (though we primarily use status updates)
CREATE POLICY "Users can delete their own likes" 
    ON public.post_likes FOR DELETE 
    USING (auth.uid()::text = user_id);

-- Ensure authenticated users can access the table
GRANT ALL ON public.post_likes TO authenticated;
GRANT SELECT ON public.post_likes TO anon;
