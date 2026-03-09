export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      airline_settings: {
        Row: {
          airline_code: string
          airline_name: string | null
          cabin_baggage: string | null
          cancellation_policy: string | null
          checkin_baggage: string | null
          created_at: string
          date_change_policy: string | null
          id: string
          name_change_policy: string | null
          no_show_policy: string | null
          updated_at: string | null
        }
        Insert: {
          airline_code: string
          airline_name?: string | null
          cabin_baggage?: string | null
          cancellation_policy?: string | null
          checkin_baggage?: string | null
          created_at?: string
          date_change_policy?: string | null
          id?: string
          name_change_policy?: string | null
          no_show_policy?: string | null
          updated_at?: string | null
        }
        Update: {
          airline_code?: string
          airline_name?: string | null
          cabin_baggage?: string | null
          cancellation_policy?: string | null
          checkin_baggage?: string | null
          created_at?: string
          date_change_policy?: string | null
          id?: string
          name_change_policy?: string | null
          no_show_policy?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      airports: {
        Row: {
          city: string
          country: string | null
          created_at: string
          iata_code: string
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
        }
        Insert: {
          city: string
          country?: string | null
          created_at?: string
          iata_code: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
        }
        Update: {
          city?: string
          country?: string | null
          created_at?: string
          iata_code?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
        }
        Relationships: []
      }
      api_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          provider: string
          settings: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider: string
          settings?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          settings?: Json | null
        }
        Relationships: []
      }
      b2b_access_requests: {
        Row: {
          admin_notes: string | null
          business_justification: string | null
          company_name: string | null
          created_at: string
          domain_requested: string | null
          id: string
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          business_justification?: string | null
          company_name?: string | null
          created_at?: string
          domain_requested?: string | null
          id?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          business_justification?: string | null
          company_name?: string | null
          created_at?: string
          domain_requested?: string | null
          id?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          sort_order: number | null
          subtitle: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          subtitle?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          subtitle?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_name: string | null
          category_id: string | null
          content: string
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          published_at: string | null
          slug: string
          status: string | null
          tags: Json | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          author_name?: string | null
          category_id?: string | null
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          author_name?: string | null
          category_id?: string | null
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string | null
          tags?: Json | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_id: string
          confirmation_data: Json | null
          confirmation_number: string | null
          created_at: string
          details: Json | null
          id: string
          status: string
          subtitle: string | null
          tenant_id: string | null
          title: string
          total: number
          type: string
          user_id: string
        }
        Insert: {
          booking_id: string
          confirmation_data?: Json | null
          confirmation_number?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
          subtitle?: string | null
          tenant_id?: string | null
          title: string
          total?: number
          type?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          confirmation_data?: Json | null
          confirmation_number?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
          subtitle?: string | null
          tenant_id?: string | null
          title?: string
          total?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          country: string | null
          created_at: string
          flights: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number | null
          rating: number | null
          sort_order: number | null
          tenant_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          flights?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price?: number | null
          rating?: number | null
          sort_order?: number | null
          tenant_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          flights?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number | null
          rating?: number | null
          sort_order?: number | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      flight_price_cache: {
        Row: {
          adults: number | null
          cabin_class: string | null
          cached_at: string | null
          children: number | null
          created_at: string
          currency: string | null
          expires_at: string | null
          from_code: string
          id: string
          infants: number | null
          lowest_price: number | null
          source: string | null
          to_code: string
          travel_date: string
        }
        Insert: {
          adults?: number | null
          cabin_class?: string | null
          cached_at?: string | null
          children?: number | null
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          from_code: string
          id?: string
          infants?: number | null
          lowest_price?: number | null
          source?: string | null
          to_code: string
          travel_date: string
        }
        Update: {
          adults?: number | null
          cabin_class?: string | null
          cached_at?: string | null
          children?: number | null
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          from_code?: string
          id?: string
          infants?: number | null
          lowest_price?: number | null
          source?: string | null
          to_code?: string
          travel_date?: string
        }
        Relationships: []
      }
      flights: {
        Row: {
          airline: string
          arrival: string | null
          class: string | null
          created_at: string
          departure: string | null
          duration: string | null
          from_city: string
          id: string
          is_active: boolean | null
          markup_percentage: number | null
          price: number | null
          seats: number | null
          stops: number | null
          to_city: string
        }
        Insert: {
          airline: string
          arrival?: string | null
          class?: string | null
          created_at?: string
          departure?: string | null
          duration?: string | null
          from_city: string
          id?: string
          is_active?: boolean | null
          markup_percentage?: number | null
          price?: number | null
          seats?: number | null
          stops?: number | null
          to_city: string
        }
        Update: {
          airline?: string
          arrival?: string | null
          class?: string | null
          created_at?: string
          departure?: string | null
          duration?: string | null
          from_city?: string
          id?: string
          is_active?: boolean | null
          markup_percentage?: number | null
          price?: number | null
          seats?: number | null
          stops?: number | null
          to_city?: string
        }
        Relationships: []
      }
      hotel_interactions: {
        Row: {
          action: string
          city: string
          created_at: string
          hotel_id: string
          hotel_name: string
          id: string
          session_id: string | null
          stars: number | null
          user_id: string | null
        }
        Insert: {
          action?: string
          city?: string
          created_at?: string
          hotel_id: string
          hotel_name?: string
          id?: string
          session_id?: string | null
          stars?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          city?: string
          created_at?: string
          hotel_id?: string
          hotel_name?: string
          id?: string
          session_id?: string | null
          stars?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      hotels: {
        Row: {
          amenities: Json | null
          city: string
          created_at: string
          id: string
          image: string | null
          is_active: boolean | null
          name: string
          price: number | null
          rating: number | null
          reviews: number | null
          stars: number | null
        }
        Insert: {
          amenities?: Json | null
          city: string
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean | null
          name: string
          price?: number | null
          rating?: number | null
          reviews?: number | null
          stars?: number | null
        }
        Update: {
          amenities?: Json | null
          city?: string
          created_at?: string
          id?: string
          image?: string | null
          is_active?: boolean | null
          name?: string
          price?: number | null
          rating?: number | null
          reviews?: number | null
          stars?: number | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          discount: string | null
          id: string
          is_active: boolean | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          discount?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          discount?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: []
      }
      popular_routes: {
        Row: {
          airline: string | null
          created_at: string | null
          currency: string | null
          duration: string | null
          from_city: string | null
          from_code: string
          id: string
          last_searched_at: string | null
          lowest_price: number | null
          search_count: number | null
          stops: number | null
          to_city: string | null
          to_code: string
        }
        Insert: {
          airline?: string | null
          created_at?: string | null
          currency?: string | null
          duration?: string | null
          from_city?: string | null
          from_code: string
          id?: string
          last_searched_at?: string | null
          lowest_price?: number | null
          search_count?: number | null
          stops?: number | null
          to_city?: string | null
          to_code: string
        }
        Update: {
          airline?: string | null
          created_at?: string | null
          currency?: string | null
          duration?: string | null
          from_city?: string | null
          from_code?: string
          id?: string
          last_searched_at?: string | null
          lowest_price?: number | null
          search_count?: number | null
          stops?: number | null
          to_city?: string | null
          to_code?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          billing_currency: string | null
          company_address: string | null
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_approved: boolean | null
          is_blocked: boolean | null
          phone: string | null
          tenant_id: string | null
          trade_license: string | null
          updated_at: string | null
          user_id: string
          user_type: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billing_currency?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean | null
          is_blocked?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          trade_license?: string | null
          updated_at?: string | null
          user_id: string
          user_type?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          billing_currency?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_approved?: boolean | null
          is_blocked?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          trade_license?: string | null
          updated_at?: string | null
          user_id?: string
          user_type?: string | null
        }
        Relationships: []
      }
      provider_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          providers: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          providers?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          providers?: Json | null
        }
        Relationships: []
      }
      saved_passengers: {
        Row: {
          created_at: string
          dob: string | null
          first_name: string
          frequent_flyer: string | null
          id: string
          last_name: string
          nationality: string | null
          passport_country: string | null
          passport_expiry: string | null
          passport_number: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          first_name: string
          frequent_flyer?: string | null
          id?: string
          last_name: string
          nationality?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          first_name?: string
          frequent_flyer?: string | null
          id?: string
          last_name?: string
          nationality?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tenant_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string | null
          rate_limit_per_minute: number | null
          tenant_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string | null
          rate_limit_per_minute?: number | null
          tenant_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string | null
          rate_limit_per_minute?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          provider: string
          settings: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider: string
          settings?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          settings?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          provider: string
          settings: Json | null
          supported_currencies: string[] | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider: string
          settings?: Json | null
          supported_currencies?: string[] | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider?: string
          settings?: Json | null
          supported_currencies?: string[] | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_active: boolean | null
          name: string
          provider_group_id: string | null
          settings: Json | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean | null
          name: string
          provider_group_id?: string | null
          settings?: Json | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean | null
          name?: string
          provider_group_id?: string | null
          settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tenants_provider_group"
            columns: ["provider_group_id"]
            isOneToOne: false
            referencedRelation: "provider_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          avatar: string | null
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          rating: number | null
          role: string | null
          tenant_id: string | null
          text: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          rating?: number | null
          role?: string | null
          tenant_id?: string | null
          text: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          rating?: number | null
          role?: string | null
          tenant_id?: string | null
          text?: string
        }
        Relationships: []
      }
      ticket_requests: {
        Row: {
          admin_notes: string | null
          booking_id: string
          charges: number | null
          created_at: string
          id: string
          new_travel_date: string | null
          quote_amount: number | null
          reason: string | null
          refund_method: string | null
          status: string
          tenant_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          booking_id: string
          charges?: number | null
          created_at?: string
          id?: string
          new_travel_date?: string | null
          quote_amount?: number | null
          reason?: string | null
          refund_method?: string | null
          status?: string
          tenant_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          booking_id?: string
          charges?: number | null
          created_at?: string
          id?: string
          new_travel_date?: string | null
          quote_amount?: number | null
          reason?: string | null
          refund_method?: string | null
          status?: string
          tenant_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_inquiries: {
        Row: {
          admin_notes: string | null
          ai_itinerary: string | null
          budget: string | null
          created_at: string
          destination: string | null
          duration: string | null
          id: string
          interests: string | null
          source: string | null
          status: string
          travel_dates: string | null
          travelers: number | null
          updated_at: string
          visitor_email: string
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_itinerary?: string | null
          budget?: string | null
          created_at?: string
          destination?: string | null
          duration?: string | null
          id?: string
          interests?: string | null
          source?: string | null
          status?: string
          travel_dates?: string | null
          travelers?: number | null
          updated_at?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_itinerary?: string | null
          budget?: string | null
          created_at?: string
          destination?: string | null
          duration?: string | null
          id?: string
          interests?: string | null
          source?: string | null
          status?: string
          travel_dates?: string | null
          travelers?: number | null
          updated_at?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: []
      }
      tours: {
        Row: {
          category: string | null
          created_at: string
          destination: string
          duration: string | null
          highlights: Json | null
          id: string
          image: string | null
          is_active: boolean | null
          name: string
          price: number | null
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          destination: string
          duration?: string | null
          highlights?: Json | null
          id?: string
          image?: string | null
          is_active?: boolean | null
          name: string
          price?: number | null
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          destination?: string
          duration?: string | null
          highlights?: Json | null
          id?: string
          image?: string | null
          is_active?: boolean | null
          name?: string
          price?: number | null
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tripjack_cities: {
        Row: {
          city_name: string
          country_name: string | null
          created_at: string
          full_region_name: string | null
          id: number
          type: string | null
        }
        Insert: {
          city_name?: string
          country_name?: string | null
          created_at?: string
          full_region_name?: string | null
          id: number
          type?: string | null
        }
        Update: {
          city_name?: string
          country_name?: string | null
          created_at?: string
          full_region_name?: string | null
          id?: number
          type?: string | null
        }
        Relationships: []
      }
      tripjack_hotels: {
        Row: {
          address: string | null
          city_code: string | null
          city_name: string | null
          country_code: string | null
          country_name: string | null
          created_at: string
          image_url: string | null
          is_deleted: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          postal_code: string | null
          property_type: string | null
          rating: number | null
          state_name: string | null
          tj_hotel_id: number
          unica_id: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city_code?: string | null
          city_name?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          image_url?: string | null
          is_deleted?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          property_type?: string | null
          rating?: number | null
          state_name?: string | null
          tj_hotel_id: number
          unica_id?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city_code?: string | null
          city_name?: string | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          image_url?: string | null
          is_deleted?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          property_type?: string | null
          rating?: number | null
          state_name?: string | null
          tj_hotel_id?: number
          unica_id?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference: string | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference?: string | null
          status?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference?: string | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_tenant_api_key: { Args: never; Returns: string }
      get_admin_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_tenant_wallet_balance: {
        Args: { _tenant_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
