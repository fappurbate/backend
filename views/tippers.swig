{% extends 'layout.swig' %}

{% block title %}Tippers - Kothique Chaturbate Backend{% endblock %}

{% block content %}
  <div class="title">Tippers - {{ broadcaster }}</div>

  <a href="/">broadcasters</a>
  <a href="/{{ broadcaster }}">profile</a>
  <a href="/{{ broadcaster }}/tippers/clear">clear</a>

  <ol>
    {% for tipper in tippers %}
      <li>{{ tipper.username }} - {{ tipper.amount }}</li>
    {% endfor %}
  </ol>
{% endblock %}
