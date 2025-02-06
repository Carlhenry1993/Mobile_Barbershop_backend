PGDMP      ;                }            renaudin_barbershop    17.2    17.2 )    "           0    0    ENCODING    ENCODING        SET client_encoding = 'UTF8';
                           false            #           0    0 
   STDSTRINGS 
   STDSTRINGS     (   SET standard_conforming_strings = 'on';
                           false            $           0    0 
   SEARCHPATH 
   SEARCHPATH     8   SELECT pg_catalog.set_config('search_path', '', false);
                           false            %           1262    16599    renaudin_barbershop    DATABASE     �   CREATE DATABASE renaudin_barbershop WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'English_United States.1252';
 #   DROP DATABASE renaudin_barbershop;
                     postgres    false            �            1259    16611    admins    TABLE     �   CREATE TABLE public.admins (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password character varying(255) NOT NULL
);
    DROP TABLE public.admins;
       public         heap r       postgres    false            �            1259    16610    admins_id_seq    SEQUENCE     �   CREATE SEQUENCE public.admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 $   DROP SEQUENCE public.admins_id_seq;
       public               postgres    false    220            &           0    0    admins_id_seq    SEQUENCE OWNED BY     ?   ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;
          public               postgres    false    219            �            1259    16679    announcements    TABLE     �   CREATE TABLE public.announcements (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone
);
 !   DROP TABLE public.announcements;
       public         heap r       postgres    false            �            1259    16678    announcements_id_seq    SEQUENCE     �   CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 +   DROP SEQUENCE public.announcements_id_seq;
       public               postgres    false    226            '           0    0    announcements_id_seq    SEQUENCE OWNED BY     M   ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;
          public               postgres    false    225            �            1259    16623    messages    TABLE     :  CREATE TABLE public.messages (
    id integer NOT NULL,
    sender character varying(255) NOT NULL,
    recipient character varying(255) NOT NULL,
    message text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    read boolean DEFAULT false,
    is_read boolean DEFAULT false
);
    DROP TABLE public.messages;
       public         heap r       postgres    false            �            1259    16622    messages_id_seq    SEQUENCE     �   CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 &   DROP SEQUENCE public.messages_id_seq;
       public               postgres    false    222            (           0    0    messages_id_seq    SEQUENCE OWNED BY     C   ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;
          public               postgres    false    221            �            1259    16601    reviews    TABLE     �   CREATE TABLE public.reviews (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    content text NOT NULL,
    review_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);
    DROP TABLE public.reviews;
       public         heap r       postgres    false            �            1259    16600    reviews_id_seq    SEQUENCE     �   CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 %   DROP SEQUENCE public.reviews_id_seq;
       public               postgres    false    218            )           0    0    reviews_id_seq    SEQUENCE OWNED BY     A   ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;
          public               postgres    false    217            �            1259    16633    users    TABLE     E  CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'client'::character varying])::text[])))
);
    DROP TABLE public.users;
       public         heap r       postgres    false            �            1259    16632    users_id_seq    SEQUENCE     �   CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
 #   DROP SEQUENCE public.users_id_seq;
       public               postgres    false    224            *           0    0    users_id_seq    SEQUENCE OWNED BY     =   ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
          public               postgres    false    223            n           2604    16614 	   admins id    DEFAULT     f   ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);
 8   ALTER TABLE public.admins ALTER COLUMN id DROP DEFAULT;
       public               postgres    false    220    219    220            t           2604    16682    announcements id    DEFAULT     t   ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);
 ?   ALTER TABLE public.announcements ALTER COLUMN id DROP DEFAULT;
       public               postgres    false    226    225    226            o           2604    16626    messages id    DEFAULT     j   ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);
 :   ALTER TABLE public.messages ALTER COLUMN id DROP DEFAULT;
       public               postgres    false    221    222    222            l           2604    16604 
   reviews id    DEFAULT     h   ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);
 9   ALTER TABLE public.reviews ALTER COLUMN id DROP DEFAULT;
       public               postgres    false    218    217    218            s           2604    16636    users id    DEFAULT     d   ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
 7   ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
       public               postgres    false    223    224    224                      0    16611    admins 
   TABLE DATA           8   COPY public.admins (id, username, password) FROM stdin;
    public               postgres    false    220   �-                 0    16679    announcements 
   TABLE DATA           S   COPY public.announcements (id, title, content, created_at, updated_at) FROM stdin;
    public               postgres    false    226   �-                 0    16623    messages 
   TABLE DATA           ^   COPY public.messages (id, sender, recipient, message, "timestamp", read, is_read) FROM stdin;
    public               postgres    false    222   �.                 0    16601    reviews 
   TABLE DATA           B   COPY public.reviews (id, title, content, review_date) FROM stdin;
    public               postgres    false    218   �E                 0    16633    users 
   TABLE DATA           =   COPY public.users (id, username, password, role) FROM stdin;
    public               postgres    false    224   �E       +           0    0    admins_id_seq    SEQUENCE SET     ;   SELECT pg_catalog.setval('public.admins_id_seq', 1, true);
          public               postgres    false    219            ,           0    0    announcements_id_seq    SEQUENCE SET     C   SELECT pg_catalog.setval('public.announcements_id_seq', 18, true);
          public               postgres    false    225            -           0    0    messages_id_seq    SEQUENCE SET     ?   SELECT pg_catalog.setval('public.messages_id_seq', 393, true);
          public               postgres    false    221            .           0    0    reviews_id_seq    SEQUENCE SET     =   SELECT pg_catalog.setval('public.reviews_id_seq', 26, true);
          public               postgres    false    217            /           0    0    users_id_seq    SEQUENCE SET     ;   SELECT pg_catalog.setval('public.users_id_seq', 27, true);
          public               postgres    false    223            z           2606    16616    admins admins_pkey 
   CONSTRAINT     P   ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);
 <   ALTER TABLE ONLY public.admins DROP CONSTRAINT admins_pkey;
       public                 postgres    false    220            |           2606    16618    admins admins_username_key 
   CONSTRAINT     Y   ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_username_key UNIQUE (username);
 D   ALTER TABLE ONLY public.admins DROP CONSTRAINT admins_username_key;
       public                 postgres    false    220            �           2606    16687     announcements announcements_pkey 
   CONSTRAINT     ^   ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
 J   ALTER TABLE ONLY public.announcements DROP CONSTRAINT announcements_pkey;
       public                 postgres    false    226            ~           2606    16631    messages messages_pkey 
   CONSTRAINT     T   ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
 @   ALTER TABLE ONLY public.messages DROP CONSTRAINT messages_pkey;
       public                 postgres    false    222            x           2606    16609    reviews reviews_pkey 
   CONSTRAINT     R   ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
 >   ALTER TABLE ONLY public.reviews DROP CONSTRAINT reviews_pkey;
       public                 postgres    false    218            �           2606    16641    users users_pkey 
   CONSTRAINT     N   ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
 :   ALTER TABLE ONLY public.users DROP CONSTRAINT users_pkey;
       public                 postgres    false    224            �           2606    16643    users users_username_key 
   CONSTRAINT     W   ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);
 B   ALTER TABLE ONLY public.users DROP CONSTRAINT users_username_key;
       public                 postgres    false    224               %   x�3�LL�����H,�HM�/H,..�/J����� ��	>         �   x�]�Kk�0����[N��V�u+�-=����E��G����*vK��0|3;[��qoާu�Ӵ�aLY�DAH|Du$�r:Ke��Y\_
+�8���ф���I9��4��\>h�w���������0C�;𠰃�g��=�i��2)��#픑���2�h�2�$.� ��!����?�����F�7g%�Q,?��A� JcXW�	��n���e�Ij�J�z�EQ|�T.            x��\K���>S��n��* $�sahe;,FH�����Ҝij�v��_�_�jTu��ɶL}�g>�Ld�~�͛������?o�2�{���i��Z�k�FR*z������L~��p!b���E��h�^�kG
ʄ����mܵUc�����M=���d��>�}�>����������R����E�yQw�yµ�ךF�������y������O���������GG�{��J����������!�պ�(��,@�v��6������SкL��Y]s�������ß�?NO����l�x��3c�]o�$�%���F�l�r�Xr+���xMz$E�?�s	w4RTZ������a\�A�5��K��?K�� V�&��a��������j������t�_=���T�P�9S����	Ҽ3,�DJ��̵�2"_Ǩ�,W�����Ss��1�!����6�a���m̥��dU�����P+�A�>�5؂֣�&S�P����R2�KQ�S����_
�k��L�vu��N7C���1{U=�8[\���KlO&��ȩ��L���V't)k��(�ʾHm,�`��-�M����2�(�"Wc���Bкkc�t*�G�չ,܍�Fջ��V�(���ӣ�Q������rJ4�����MB�`�P_��w����|��������p:��?z���~�=7�ϟ�*����b:�<?�P�i��V�h���ɖ+��Rd�MK� )ˍ۸1�Q��|q��3��2i&�������q��.Em��YƩ���s~)�)�!Y�������W����s8�,���smdAφ��h���M���)?��+'��P��ꁸu?P��d�&��n���6� $Dtj����N�¡������_�sl)*��	z�a�U&rď֐/��������I��}O�g���Xs�`�v�x�`��q�q}��16
�kb= F�-��*r��U�f�>�_�"�0� ��E&nL`4�����l�r�-���9S�T;��eۍ&�X����X���ğ���F��)��w��~!�.|DԳ����qC\Oq�U1�T%���^A��
^x8��_����%�����������_����ǻӗ�l�tʢ�u��É����l]��pK�L5����k[Ǚ������p|�6������s/��R�g2gǤU�vb��l��&O�W}H����T��rzB����bLWb؊.��˴2��`���fƂ+w��P��i�~z2�ٽ[J�\��(�*e�9W��7ή�R0��T�lj�	Vv�X�A�5<�*���,��:NE��:�U���f;�/���C����Cs�ÿ�����\�i8�+����ʅF?�f1�R��aڑ�������t����s-㌮�����8��%μ�f�t�O���9�6����-:��l�7wN��TT���>*�-��CSs2���SR>������X4gy�<ը��]0��d�ӈ�ӹ:���.����2���$����]�`��c�OP���û���
�Mn�Q���,C��I���<�a�װczޜ4����vy
�8+o��L�k��ƹ�v����oD���i1���PZ��.�!���[=�i}��g��G���~��&���W���ze��ę�Ȟbr����uEd]�*��pa��/����('%�7`8�[	L��:��̚�'�;kI�Z�>�M�t��s��!0�	֗��1c�@�ڸ���t�V���%<ri#�L��S�4M����)V����Qa�m�;�tu�\l��T.萪�jm.���2�P0J�������|���w�1FU�]^����a8O��Qi�=*bcbo��{�~��,đE����K�E<tG\�uȠ9鐽�o�J�d($��,�i�b����B��vTs�[����X�[.��:_o�w�~$��kVJ�����'IF��G�t��؀ד0�:��d�[J�ťNUg`�RI� S����$-�uR~ACG,��U�������^_�J��5 ��ߟ~���%���Y�f���s^�n��1�H<8��V��&�_�FM-���^q߳@��OkL�9����	\�y��!�������R.�+#�+��z��D�����9># �9���_�}�#qY�rt��/��ۮ�2?�sn�[�;f�*�{'w�?���Ǯ5�2��'(��ge���Ф�����g���ɥz����&_����"ϳ-����=x)jJ�W���~>�[��Б���UGa�y����i@�ce�������5T�G]Y�e�/��ޚ�r2c�ȼg������sVև���7�n���I��f7|<oX�x�5�(`A*}5_Ko���䵒��X�#]U	̹j�u[�K]!���oñ>X�hmC��W:���܈\��!��+:���bt!?���Z0׀P�L�ku�Q��N�K���NY��~E 9������F�v��"��d���B�F!>��R�I�Q�bg�/�gE�h���W��%�o�%�a�p��	����g���8�CЗ�įӢ��n�4��$�ڥM-
L��Փ���f��\)�BO�յ8�}{��4��,�}s���s)���!�H��������Do_@r?�H�M䟥�f�����������~,h���O?�|�}�p)���%w��q��w7�7��)�)½���͵���R �V��$������xc��M�����_vK��.9�NN\039�;q��i+�����^�$7�W�.*�w��2i�W�M�-�g�u�Z?�a�������E���$�^���W��\��w[ル7U;�պa��Nu�\K�J�=Y%{����ҷ����\�:En���O����{�(������ �z8�)�E��#mr8VZ
$���KFE��P-J�����ֆt&��S�����e�����*<m-�r�Z�>	<��<�;�s8�PU>�ѳ�zH�5ul�|��>��T IԎ>�C��&$Y��C���|�������	�s΁X�wL��}�j{���	���S�.����eo�2aY��ќ+����h
�U4���^�X��#�RFN1n	����[��Ť�b�p��^cp�>����ͫu�2H��+f��Ҽ\}U<{͓A���p� �}^Y�d#��9R��\n��V�t�de�p�a�H�?�Gӫs6��o�a�t��	����L�/��r��LYX��qU8��3e�*�꫹��J^n8����
�F��.+�WZM��ѣ��D��,������1B���j��؊�g�тV��s�qW�[r�B>Y�w���oGT��ѝL��K.O���Sݡ"�.;U���N�`���w\�v�Dαǀs�ht�˱t����a���{�\���f�|*�z���2\g��5�1�{�g���yY�1�^�^B�[a�h�>5L=<�+ ��1F'Km.��*�Z'W����՘Y�Z�-�*N�<�}��3ܲ�7����C��0��Ġ�x܆�e��r��8|��7�o��kp�dCWݰ�����\��zxOTK��>9Ȱ׬,Q�X��8�_5�����m����t�gg伓@k���3j#x?����N���,�Zº�g�S�����Q܆ù�&��<�+���)w�Z�P�Z��G�
yqJ�A�Sp���j�"e���Yנ	Gd��1��ҁח����e/v�cAn���[_�4�h�C SW�p���;	�D?m�r]MQ�[�6���]L�[B�VbtÜ�Y)�����v[���Ӂ[��2M+�N�-b9���Ԅ����S���*V`J_N �g�;8/T������5����pI���n9�g��ѵ����<�o>�~�p����_��/����1F�r�Μ�_^���I(q���;u��ֿV��L2�Z�4Ξ�oo��!nQD�&�+\~@�/_H���%�^YR������a2f�)�珘�;&�!�D��S\����R���A��7��x2��i���G$�up��\���K���g��E�2��x���\qIS��+ƚ	 �  䚖rPk�+��=v>��������i<�{Y�㜔���}'g��҇<�=�-x.I[�%s7m5�i���Uf8�����j�@i)��3�	3�M]����y��D�r�[ꭗy���-�&�.��j�ބN�:�A�R��d��	pm�����g$���aX9�(\C�=V�o��ߗ�����+�i�kpx^n�n�ZL��d���j�?]�7"h/��4�pJ��t��EhM��?�T�?�PF6ܖ��w'��䭓��^M�$aȡ���c��q�X\�����9?4�5�3=9IK�=�3��I��\}"��UR!p$��~�w�03�Kzȿ��I�IΏ�J����}d8�O
S�����p~GP�=�A�7����n�]�������q���I�\�;����$�1�+5n~���;��E�@������%<d�kT��Ғ݂�'{�ҧ��-���b|�{䞚**��><���4��J�s���''	Aj���4")�}�&��B�Z+O޹Z�&�q��rwR�}�
�8�P?)�r���>q��4��K����mPI[:Ia���@N�P�}c�p.i��,�o�n�~�]-:��+�!���ZZ!�u�0m�2�鼖NKK���ބ�ee��k��	\\>7#�u�����e�u���+�˨�ܭ��Sï$�·��� �C��b�̐_��K0Y+ͦ	�X��wx�}�<KS�n����jd�N�e�Sn1��Ԫ8��7tϯF�wr��kɟ�D�U5ç&F�^&n�C��Gd�zk����ͥ�Y���ʵ��/t�c�H2z�k9���G$��4o�\��U�ߝFo�v�m��X��N*�d|{dk2�mm��U�N�q��M9/ͨ�k�8�htNժ.{t&Q���N��sW|���<\,�Q�����k�:Q󂳆��E%�M��)�-�k��;QSʹP��r8O�iQ7��.��X���R#��u���w�al~K$Eg�N����Hb_ G�y.�bBo��)�/�m�_�{!�d�N�$��0��V����|�G�R�$�y��zm�0(�f���E�˯
!�qz\O�v��s��h����ug8�S��d;%��+)�tl%�6�����+F���F��9���'�P~��S��L$Mȟk��НZ]����4ݓ���(�6MY�Ε
>U�wp�=:Lh�<n�F׬�ܶ.��׵'p��%L�u.5���A�d���vnU�&X��:����0�-� x2z�V�/�� ��֭��;�����.��;���q�T������&���s'��=j�[��p�������QH���%�"Dһ���;�g�=�?O����p����d٭y1������q?<�펿#�?��0+�"*��Ee��M���8�FD����_P+��)�&�qӗ���F��(4$�n>8W��V��S�Z�^�I��=����)����4 u�"�y1an��ժ��1<nMV)4\,�?����Դ�������u/?4+�T�&2����?���j0a��,*l���~�6QZ�)�=�L�����Wo
k���) R)P\3�ο"N�ֆi�;O��]�T��h�;��'��$����Zf��i��dqͼ'xV���Dָ��Ѣ��
%`��S3�I{>t��/���\g(����Zx�)FIW�ƻ�Z:��x���RF��.�@���#�����ߚ �B���n����]#�z�\]��᤹�S���o������3�         X   x��;�  Й����ڈ1l�k��؁H�?��=f}s7��'r�#j}:�J���J�ޔK�f�s��,2G�1,n�31�� ���           x�M�G��J�����c$�!A�E��&�"HR�$��g�n�=��|k���>�N���ݰ�~��/��u��X��M��z�e:����	T$�8G{(��J��.wo�6��/��X�A� ��d��AA��C[��j�U��o�i[
_ŶFCFhwq�V��S��e/c��Ѱ�)?� �1!���#f2g1�-;Yx��~"���E�����2Q6���9�zL��#{/��i�#9COM��mQ�ֲU��W��A�}H��t�^f?
�t��9�0�}��cnL�3eѶ�1&���[���bwz_n(�t����a�.������@MCt5Ӥwu_?�0ב�
�q�XEq;=n��z���X��J7�k��BٺL��d�`�FjtZq!k��.�G~Ta�7s�,b��mEIO(�M.á��+�M�����0�Ճ�c���!�}ϸ��gYI�5!w�5{ҩ��.%��2����i��4��jxȕ���X��KFE�+��%Ew�[�K�C�2�!��@4��ťlm�z�އE��X�)#;��C��?�'�PdӄLw�Z5����4b����wN�}����7�p�$GK,$�{�~���x_���S�D;�WM��L@3.�R�Q;vU?|h�ia�p�!:�P��������g�"x!B.����I����)�?�|�!v�]�jM�%~9_K�Ԧ��_U����W���10ɪw���줾���3��ί�O�[<
�$��+���BA2�80:�۟��I�QL��q�7�]���Iv�B()��Ur��!r��ͧ�n\|]@�h�uS��<��0^M�c�����o�P�O��xwxu�f�lB�
��ԉXV��no�t�1���!-f}h8�3��T?�μ1P�$7��D�K쏩1��LL��d��|��,���i����)���~a�[�Rh�X��s�`��*8L�,����d��#'7D3jVb_ύZm<���ە.��!qX�H���}l�@ډG�/�kU�B��S\�\�����oc>r����*8"FR-&��ĊPXH��"��\ȇ��0�ۏ,�؀n�8t>��Kճ_aC?_P8Ft^��A|�+��f�	�ZJ�R��ډM�j��P�m&����u�e_%1�.@Y�#����Q99�@X�{���T����z�C<�� �\�b�n*eڭ�] D���E� �!4sn�R��,캕g~�S<�\����(Q:��_Uc�c�����E��;=��}w���3��u�?�����:c�     